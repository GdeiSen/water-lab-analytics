use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DateRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataQuery {
    pub session_token: String,
    pub archive_id: i64,
    pub test_ids: Vec<i64>,
    pub object_keys: Vec<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartDataset {
    pub tests: Vec<ChartTest>,
    pub objects: Vec<ChartObject>,
    pub points: Vec<ChartPoint>,
    pub stats_by_test: Vec<ChartTestStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartTest {
    pub test_id: i64,
    pub test_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartObject {
    pub object_key: String,
    pub object_label: String,
    pub object_order: u16,
    pub object_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartPoint {
    pub date: String,
    pub values: Vec<ChartValuePoint>,
    pub averages: Vec<ChartAveragePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartValuePoint {
    pub test_id: i64,
    pub object_key: String,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartAveragePoint {
    pub test_id: i64,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartTestStats {
    pub test_id: i64,
    pub test_name: String,
    pub stats: ChartStats,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChartStats {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub average: Option<f64>,
    pub median: Option<f64>,
    pub std_dev: Option<f64>,
    pub points_with_values: usize,
}
