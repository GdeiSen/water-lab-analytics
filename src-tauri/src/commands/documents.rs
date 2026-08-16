use std::{fs, path::PathBuf, process::Command};

use tauri::State;
use uuid::Uuid;

use crate::{
    errors::AppError,
    models::{DocumentCategory, DocumentInfo},
    AppState,
};

#[tauri::command]
pub async fn list_document_categories(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<Vec<DocumentCategory>, AppError> {
    state.require_session(&session_token)?;
    state.db.list_document_categories()
}

#[tauri::command]
pub async fn create_document_category(
    session_token: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<DocumentCategory, AppError> {
    state.require_session(&session_token)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Название категории не может быть пустым".to_string()));
    }
    state.db.create_document_category(trimmed)
}

#[tauri::command]
pub async fn rename_document_category(
    session_token: String,
    category_id: i64,
    name: String,
    state: State<'_, AppState>,
) -> Result<DocumentCategory, AppError> {
    state.require_session(&session_token)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Название категории не может быть пустым".to_string()));
    }
    state.db.rename_document_category(category_id, trimmed)
}

#[tauri::command]
pub async fn delete_document_category(
    session_token: String,
    category_id: i64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_session(&session_token)?;
    state.db.delete_document_category(category_id)
}

/// `category_id: None` lists uncategorized documents only — see
/// `list_all_documents` for the unfiltered "every document" view.
#[tauri::command]
pub async fn list_documents(
    session_token: String,
    category_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<DocumentInfo>, AppError> {
    state.require_session(&session_token)?;
    state.db.list_documents(category_id)
}

#[tauri::command]
pub async fn list_all_documents(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<Vec<DocumentInfo>, AppError> {
    state.require_session(&session_token)?;
    state.db.list_all_documents()
}

#[tauri::command]
pub async fn import_document(
    session_token: String,
    source_path: String,
    category_id: Option<i64>,
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocumentInfo, AppError> {
    state.require_session(&session_token)?;

    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(AppError::Validation(format!("Файл не найден: {}", source.display())));
    }

    let original_name = source
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| AppError::Validation("Некорректное имя файла".to_string()))?;
    let extension = source
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let stored_name = match extension.is_empty() {
        true => Uuid::new_v4().to_string(),
        false => format!("{}.{}", Uuid::new_v4(), extension),
    };

    let target = state.documents_dir.join(&stored_name);
    fs::copy(&source, &target)?;
    let size_bytes = fs::metadata(&target)?.len() as i64;

    let resolved_title = title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            source
                .file_stem()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| original_name.clone())
        });

    state
        .db
        .insert_document(category_id, &resolved_title, &stored_name, &original_name, &extension, size_bytes)
}

#[tauri::command]
pub async fn update_document(
    session_token: String,
    document_id: i64,
    title: String,
    category_id: Option<i64>,
    notes: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocumentInfo, AppError> {
    state.require_session(&session_token)?;
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(AppError::Validation("Название документа не может быть пустым".to_string()));
    }
    state
        .db
        .update_document(document_id, trimmed_title, category_id, notes.as_deref())
}

#[tauri::command]
pub async fn delete_document(
    session_token: String,
    document_id: i64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_session(&session_token)?;
    let row = state.db.delete_document(document_id)?;

    let path = state.documents_dir.join(&row.stored_name);
    if path.exists() {
        fs::remove_file(path)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn read_document_bytes(
    session_token: String,
    document_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, AppError> {
    state.require_session(&session_token)?;
    let row = state.db.get_document_row(document_id)?;
    let path = state.documents_dir.join(&row.stored_name);
    let bytes = fs::read(path)?;
    Ok(bytes)
}

/// Opens the document with the OS's default application for its file type
/// (e.g. an .xlsx report form opens in Excel). Shells out to the platform's
/// native "open" launcher directly rather than adding a Tauri
/// shell/opener plugin dependency for this one action.
#[tauri::command]
pub async fn reveal_document(
    session_token: String,
    document_id: i64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_session(&session_token)?;
    let row = state.db.get_document_row(document_id)?;
    let path = state.documents_dir.join(&row.stored_name);
    if !path.exists() {
        return Err(AppError::Validation("Файл документа не найден на диске".to_string()));
    }

    open_with_default_app(&path)
}

#[cfg(target_os = "macos")]
fn open_with_default_app(path: &std::path::Path) -> Result<(), AppError> {
    Command::new("open").arg(path).status()?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_with_default_app(path: &std::path::Path) -> Result<(), AppError> {
    Command::new("cmd").args(["/C", "start", "", &path.to_string_lossy()]).status()?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_with_default_app(path: &std::path::Path) -> Result<(), AppError> {
    Command::new("xdg-open").arg(path).status()?;
    Ok(())
}
