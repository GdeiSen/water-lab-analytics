use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::{
    errors::AppError,
    models::{ArchiveSummary, ChartDataset, DataQuery, RetroFileDetails, RetroFileInfo, TestType},
    storage::retro_cache::process_retro_archive,
    watcher::start_retro_archive_watcher,
    AppState,
};

#[tauri::command]
pub async fn select_retro_archive(
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

    let summary = process_retro_archive(&path, &state.db, Some(&app), &state.normalizer())?;
    let _ = start_retro_archive_watcher(path, app, state.inner().clone());
    Ok(summary)
}

#[tauri::command]
pub async fn rescan_retro_archive(
    session_token: String,
    archive_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ArchiveSummary, AppError> {
    state.require_session(&session_token)?;

    let path = state
        .db
        .retro_archive_path_by_id(archive_id)?
        .ok_or_else(|| AppError::Validation("Ретроспективный архив не найден".to_string()))?;

    let path = PathBuf::from(path);
    process_retro_archive(&path, &state.db, Some(&app), &state.normalizer())
}

#[tauri::command]
pub async fn get_retro_file_list(
    session_token: String,
    archive_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<RetroFileInfo>, AppError> {
    state.require_session(&session_token)?;

    let id = match archive_id {
        Some(id) => id,
        None => state
            .db
            .get_latest_retro_archive_id()?
            .ok_or_else(|| AppError::Validation("Ретроспективный архив ещё не выбран".to_string()))?,
    };

    state.db.get_retro_file_list(id)
}

#[tauri::command]
pub async fn get_retro_file_details(
    session_token: String,
    file_id: i64,
    state: State<'_, AppState>,
) -> Result<RetroFileDetails, AppError> {
    state.require_session(&session_token)?;
    state.db.get_retro_file_details(file_id)
}

/// With `file_id` — the parameters of that one sheet, which is what the
/// sidebar lists once the user picks a file. Without it — every parameter in
/// the archive, used to resolve parameters that stay selected after the user
/// moves to another sheet.
#[tauri::command]
pub async fn get_retro_test_types(
    session_token: String,
    archive_id: Option<i64>,
    file_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<TestType>, AppError> {
    state.require_session(&session_token)?;

    if let Some(file_id) = file_id {
        return state.db.get_retro_test_types_for_file(file_id);
    }

    let id = match archive_id {
        Some(id) => id,
        None => state
            .db
            .get_latest_retro_archive_id()?
            .ok_or_else(|| AppError::Validation("Ретроспективный архив ещё не выбран".to_string()))?,
    };

    state.db.get_retro_test_types_for_archive(id)
}

#[tauri::command]
pub async fn get_retro_chart_data(
    query: DataQuery,
    state: State<'_, AppState>,
) -> Result<ChartDataset, AppError> {
    state.require_session(&query.session_token)?;
    state.db.query_retro_chart_data(&query)
}

#[tauri::command]
pub async fn get_last_retro_archive_path(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    state.require_session(&session_token)?;
    state.db.get_setting("last_retro_archive")
}
