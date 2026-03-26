use serde::{Deserialize, Serialize};

use crate::models::measurement::TechnologicalObject;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSummary {
    pub archive_id: i64,
    pub archive_path: String,
    pub total_files: usize,
    pub processed_files: usize,
    pub skipped_files: usize,
    pub ok_files: usize,
    pub warning_files: usize,
    pub error_files: usize,
    pub test_names: Vec<String>,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseProgress {
    pub current: u32,
    pub total: u32,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub id: i64,
    pub filename: String,
    pub date: String,
    pub status: String,
    pub warnings: Vec<String>,
    pub object_count: u16,
    pub parsed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDetails {
    pub id: i64,
    pub filename: String,
    pub date: String,
    pub status: String,
    pub warnings: Vec<String>,
    pub object_count: u16,
    pub objects: Vec<TechnologicalObject>,
    pub measurements: Vec<FileMeasurementRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeasurementRecord {
    pub test_id: i64,
    pub test_name: String,
    pub object_key: String,
    pub object_label: String,
    pub object_order: u16,
    pub value: Option<f64>,
    pub raw_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestType {
    pub id: i64,
    pub canonical_name: String,
    pub display_name: String,
    pub unit: Option<String>,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthToken {
    pub token: String,
    pub username: String,
    pub role: UserRole,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Viewer,
    Admin,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserRole::Viewer => "viewer",
            UserRole::Admin => "admin",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "admin" => UserRole::Admin,
            _ => UserRole::Viewer,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    pub username: String,
    pub role: UserRole,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangedEvent {
    pub filename: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileErrorEvent {
    pub filename: String,
    pub error: String,
}
