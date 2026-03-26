use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::Arc,
};

use parking_lot::Mutex;
use tauri::Manager;
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

pub mod commands;
pub mod errors;
pub mod models;
pub mod parser;
pub mod storage;
pub mod watcher;

use errors::AppError;
use models::{Session, UserRole};
use parser::normalizer::NameNormalizer;
use storage::Database;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    watched_archives: Arc<Mutex<HashSet<String>>>,
    normalizer: Arc<NameNormalizer>,
}

impl AppState {
    fn new(db: Database, normalizer: NameNormalizer) -> Self {
        Self {
            db,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            watched_archives: Arc::new(Mutex::new(HashSet::new())),
            normalizer: Arc::new(normalizer),
        }
    }

    pub fn create_session(&self, username: String, role: UserRole) -> String {
        let token = Uuid::new_v4().to_string();
        self.sessions
            .lock()
            .insert(token.clone(), Session { username, role });
        token
    }

    pub fn require_session(&self, token: &str) -> Result<Session, AppError> {
        self.sessions
            .lock()
            .get(token)
            .cloned()
            .ok_or_else(|| AppError::Auth("Сессия не найдена или истекла".to_string()))
    }

    pub fn remove_session(&self, token: &str) -> bool {
        self.sessions.lock().remove(token).is_some()
    }

    pub fn normalizer(&self) -> NameNormalizer {
        (*self.normalizer).clone()
    }

    pub fn mark_archive_watched(&self, path: String) -> bool {
        let mut watched = self.watched_archives.lock();
        if watched.contains(&path) {
            return false;
        }
        watched.insert(path);
        true
    }
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target(false)
        .compact()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let runtime_dir = resolve_runtime_dir()?;
            fs::create_dir_all(&runtime_dir)?;

            let aliases_file = runtime_dir.join("aliases.json");
            if !aliases_file.exists() {
                fs::write(&aliases_file, include_str!("../aliases.json"))?;
            }

            let db_path = runtime_dir.join("water_lab_analytics.db");
            let db = Database::new(&db_path)?;
            db.ensure_default_admin()?;

            let normalizer = NameNormalizer::from_aliases_file(aliases_file)?;
            let state = AppState::new(db, normalizer);

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::archive::select_archive,
            commands::archive::get_file_list,
            commands::archive::rescan_archive,
            commands::data::get_chart_data,
            commands::data::get_test_types,
            commands::data::get_file_details,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::whoami,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_last_archive_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn resolve_runtime_dir() -> Result<PathBuf, AppError> {
    if let Ok(raw) = std::env::var("WLA_DATA_DIR") {
        let path = PathBuf::from(raw);
        if !path.as_os_str().is_empty() {
            return Ok(path);
        }
    }

    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or_else(|| {
        AppError::Generic("Не удалось определить директорию исполняемого файла".to_string())
    })?;
    Ok(dir.to_path_buf())
}
