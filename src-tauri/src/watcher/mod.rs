use std::{
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::{
    errors::AppError,
    models::{FileChangedEvent, FileErrorEvent},
    storage::cache::process_archive,
    AppState,
};

pub fn start_archive_watcher(
    path: PathBuf,
    app: AppHandle,
    state: AppState,
) -> Result<(), AppError> {
    let path_key = path.to_string_lossy().to_string();
    if !state.mark_archive_watched(path_key.clone()) {
        return Ok(());
    }

    thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(watcher) => watcher,
            Err(error) => {
                let _ = app.emit(
                    "file:error",
                    FileErrorEvent {
                        filename: path_key.clone(),
                        error: format!("Не удалось создать watcher: {error}"),
                    },
                );
                return;
            }
        };

        if let Err(error) = watcher.watch(&path, RecursiveMode::Recursive) {
            let _ = app.emit(
                "file:error",
                FileErrorEvent {
                    filename: path_key.clone(),
                    error: format!("Не удалось начать наблюдение: {error}"),
                },
            );
            return;
        }

        let mut last_reparse = Instant::now() - Duration::from_secs(10);

        for event in rx {
            let Ok(event) = event else {
                continue;
            };

            let changed_excel = event.paths.iter().find(|path| is_excel(path)).cloned();
            let Some(changed_path) = changed_excel else {
                continue;
            };

            let action = match event.kind {
                EventKind::Create(_) => "created",
                EventKind::Modify(_) => "modified",
                EventKind::Remove(_) => "removed",
                _ => "changed",
            }
            .to_string();

            let _ = app.emit(
                "file:changed",
                FileChangedEvent {
                    filename: changed_path.to_string_lossy().to_string(),
                    action,
                },
            );

            if last_reparse.elapsed() < Duration::from_millis(800) {
                continue;
            }
            last_reparse = Instant::now();

            if let Err(error) = process_archive(&path, &state.db, Some(&app), &state.normalizer()) {
                let _ = app.emit(
                    "file:error",
                    FileErrorEvent {
                        filename: changed_path.to_string_lossy().to_string(),
                        error: error.to_string(),
                    },
                );
            }
        }
    });

    Ok(())
}

fn is_excel(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext = ext.to_lowercase();
            ext == "xlsx" || ext == "xls"
        })
        .unwrap_or(false)
}
