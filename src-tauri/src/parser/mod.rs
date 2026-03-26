pub mod excel_reader;
pub mod normalizer;
pub mod structure;
pub mod validator;

use std::path::Path;

use chrono::NaiveDate;

use crate::{
    models::ParsedFile,
    parser::{excel_reader::parse_file, normalizer::NameNormalizer},
};

pub fn parse_file_safe(path: &Path, normalizer: &NameNormalizer) -> ParsedFile {
    match parse_file(path, normalizer) {
        Ok(parsed) => parsed,
        Err(error) => {
            let filename = path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown.xlsx".to_string());
            let fallback = excel_reader::parse_date_from_filename(path).unwrap_or_else(|_| {
                NaiveDate::from_ymd_opt(1970, 1, 1).expect("valid fallback date")
            });
            ParsedFile::error(filename, fallback, error.to_string())
        }
    }
}
