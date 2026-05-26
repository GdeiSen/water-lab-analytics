use tauri::State;

use crate::{
    errors::AppError,
    models::{ChartDataset, DataQuery, FileDetails, TestType},
    AppState,
};

#[tauri::command]
pub async fn get_chart_data(
    query: DataQuery,
    state: State<'_, AppState>,
) -> Result<ChartDataset, AppError> {
    state.require_session(&query.session_token)?;
    state.db.query_chart_data(&query)
}

#[tauri::command]
pub async fn get_test_types(
    session_token: String,
    archive_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<TestType>, AppError> {
    state.require_session(&session_token)?;
    let id = match archive_id {
        Some(id) => id,
        None => state
            .db
            .get_latest_archive_id()?
            .ok_or_else(|| AppError::Validation("Архив ещё не выбран".to_string()))?,
    };

    state.db.get_test_types_for_archive(id)
}

#[tauri::command]
pub async fn get_file_details(
    session_token: String,
    file_id: i64,
    state: State<'_, AppState>,
) -> Result<FileDetails, AppError> {
    state.require_session(&session_token)?;
    state.db.get_file_details(file_id)
}
