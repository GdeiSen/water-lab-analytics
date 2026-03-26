use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedFile {
    pub date: NaiveDate,
    pub filename: String,
    pub status: FileStatus,
    pub warnings: Vec<String>,
    pub object_count: u16,
    pub objects: Vec<TechnologicalObject>,
    pub measurements: Vec<Measurement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "details", rename_all = "lowercase")]
pub enum FileStatus {
    Ok,
    Warning(Vec<String>),
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    pub test_name: String,
    pub test_name_raw: String,
    pub values: Vec<ObjectValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechnologicalObject {
    pub key: String,
    pub label: String,
    pub order: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectValue {
    pub object_key: String,
    pub object_label: String,
    pub object_order: u16,
    pub value: Option<f64>,
    pub raw_value: String,
}

impl ParsedFile {
    pub fn error(filename: String, date: NaiveDate, message: String) -> Self {
        Self {
            date,
            filename,
            status: FileStatus::Error(message.clone()),
            warnings: vec![message],
            object_count: 0,
            objects: Vec::new(),
            measurements: Vec::new(),
        }
    }
}

impl FileStatus {
    pub fn as_db_value(&self) -> &'static str {
        match self {
            FileStatus::Ok => "ok",
            FileStatus::Warning(_) => "warning",
            FileStatus::Error(_) => "error",
        }
    }
}
