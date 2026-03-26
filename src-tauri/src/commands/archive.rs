use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::{
    errors::AppError,
    models::{ArchiveSummary, FileInfo},
    storage::cache::process_archive,
    watcher::start_archive_watcher,
    AppState,
};

#[tauri::command]
pub async fn select_archive(
    session_token: String,
    archive_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ArchiveSummary, AppError> {
    state.require_session(&session_token)?;

    let path = PathBuf::from(archive_path);
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Папка архива не найдена: {}",
            path.display()
        )));
    }

    let summary = process_archive(&path, &state.db, Some(&app), &state.normalizer())?;
    let _ = start_archive_watcher(path, app, state.inner().clone());
    Ok(summary)
}

#[tauri::command]
pub async fn get_file_list(
    session_token: String,
    archive_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<FileInfo>, AppError> {
    state.require_session(&session_token)?;

    let id = match archive_id {
        Some(id) => id,
        None => state
            .db
            .get_latest_archive_id()?
            .ok_or_else(|| AppError::Validation("Архив ещё не выбран".to_string()))?,
    };

    state.db.get_file_list(id)
}

#[tauri::command]
pub async fn rescan_archive(
    session_token: String,
    archive_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ArchiveSummary, AppError> {
    state.require_session(&session_token)?;

    let path = state
        .db
        .archive_path_by_id(archive_id)?
        .ok_or_else(|| AppError::Validation("Архив не найден".to_string()))?;

    let path = PathBuf::from(path);
    process_archive(&path, &state.db, Some(&app), &state.normalizer())
}
