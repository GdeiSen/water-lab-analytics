use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::models::measurement::FileStatus;

/// Retro data has no technological-object dimension: a retro sheet is one
/// sampling point (plant inlet, after the primary settlers, plant outlet),
/// and a "Секция N:" band inside a sheet is folded into the parameter name
/// by the parser. Every retro point is therefore stored under this single
/// synthetic object key, which keeps `retro_points` compatible with the
/// daily `ChartDataset` shape (and, because every series shares one object,
/// keeps input->output efficiency pairing working — it matches values by
/// identical object key).
pub const RETRO_OBJECT_KEY: &str = "retro";

/// A single labelled constant read from above a retro sheet's month header
/// (e.g. "Рабочий объем Аэротенка = 6350.4 м3") — object "passport" data
/// rather than a monthly time series. Doubles as the IPC-facing shape (see
/// `RetroFileDetails.facts` / src/lib/types.ts `RetroFact`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroFact {
    pub label: String,
    pub value: Option<f64>,
    pub raw_value: String,
}

/// One (test × month) reading extracted from a retro sheet.
/// Internal parser output only — persisted into `retro_points`, never sent
/// over IPC directly.
#[derive(Debug, Clone)]
pub struct RetroPointValue {
    pub test_name: String,
    pub test_name_raw: String,
    pub period_date: NaiveDate,
    pub value: Option<f64>,
    pub raw_value: String,
}

/// Parser output for one logical retro dataset. A single .xlsx file can
/// contain several of these (one per sheet) when it covers several sampling
/// points, e.g. plant inlet / after primary settling / plant outlet.
#[derive(Debug, Clone)]
pub struct RetroParsedFile {
    /// `"<physical filename>::<sheet name>"` — disambiguates sheets from the
    /// same file for the `retro_files` unique constraint.
    pub filename: String,
    pub title: String,
    /// Short human label for what this sheet represents, e.g. "Вход ОС" /
    /// "Выход ОС" / "Вход БО". Shown in the file list so a sheet is
    /// identifiable without reading the `::SheetN` suffix of `filename`.
    pub source_label: String,
    pub status: FileStatus,
    pub warnings: Vec<String>,
    pub facts: Vec<RetroFact>,
    pub points: Vec<RetroPointValue>,
}

impl RetroParsedFile {
    pub fn error(filename: String, title: String, message: String) -> Self {
        Self {
            filename,
            source_label: title.clone(),
            title,
            status: FileStatus::Error(message.clone()),
            warnings: vec![message],
            facts: Vec::new(),
            points: Vec::new(),
        }
    }

    pub fn period_from(&self) -> Option<NaiveDate> {
        self.points.iter().map(|point| point.period_date).min()
    }

    pub fn period_to(&self) -> Option<NaiveDate> {
        self.points.iter().map(|point| point.period_date).max()
    }
}

// --- IPC-facing models — mirror src/lib/types.ts -----------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroFileInfo {
    pub id: i64,
    pub filename: String,
    pub title: String,
    pub status: String,
    pub warnings: Vec<String>,
    pub period_from: Option<String>,
    pub period_to: Option<String>,
    pub parsed_at: String,
    /// Short human label for what this sheet represents (see
    /// `RetroParsedFile::source_label`) — lets the file list show which
    /// sampling point a sheet is instead of a filename whose distinguishing
    /// part (the `::SheetN` suffix) sits at the end and gets clipped in a
    /// narrow list.
    pub source_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroFileDetails {
    pub id: i64,
    pub filename: String,
    pub title: String,
    pub status: String,
    pub warnings: Vec<String>,
    pub facts: Vec<RetroFact>,
}
