use tauri::State;

use crate::{errors::AppError, AppState};

#[tauri::command]
pub async fn get_setting(
    session_token: String,
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    state.require_session(&session_token)?;
    state.db.get_setting(&key)
}

#[tauri::command]
pub async fn set_setting(
    session_token: String,
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_session(&session_token)?;
    state.db.set_setting(&key, &value)
}

#[tauri::command]
pub async fn get_last_archive_path(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    state.require_session(&session_token)?;
    state.db.get_last_archive_setting()
}
