use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCategory {
    pub id: i64,
    pub name: String,
    pub order_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInfo {
    pub id: i64,
    pub category_id: Option<i64>,
    pub title: String,
    pub original_name: String,
    pub extension: String,
    pub size_bytes: i64,
    pub notes: Option<String>,
    pub added_at: String,
    pub order_index: i64,
}

/// Internal row shape that additionally carries the on-disk stored file
/// name — never sent over IPC (the frontend addresses documents by id).
#[derive(Debug, Clone)]
pub struct DocumentRow {
    pub info: DocumentInfo,
    pub stored_name: String,
}
