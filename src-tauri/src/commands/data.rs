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
    state: State<'_, AppState>,
) -> Result<Vec<TestType>, AppError> {
    state.require_session(&session_token)?;
    state.db.get_all_test_types()
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
