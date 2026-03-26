use std::path::Path;

use calamine::{open_workbook_auto, Reader};
use chrono::NaiveDate;
use once_cell::sync::Lazy;
use regex::Regex;

use crate::{
    errors::ParseError,
    models::{FileStatus, Measurement, ObjectValue, ParsedFile, TechnologicalObject},
    parser::{
        normalizer::NameNormalizer,
        structure::{cell_to_string, detect_header, parse_numeric_cell},
        validator::is_service_row,
    },
};

static FILENAME_DATE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?P<day>\d{2})[._](?P<month>\d{2})[._](?P<year>\d{4})").expect("valid regex")
});

pub fn parse_file(path: &Path, normalizer: &NameNormalizer) -> Result<ParsedFile, ParseError> {
    let date = parse_date_from_filename(path)?;
    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .ok_or(ParseError::InvalidFilename)?;

    let mut workbook = open_workbook_auto(path)?;
    let sheet = workbook
        .worksheet_range_at(0)
        .ok_or(ParseError::NoSheet)??;

    if sheet.height() == 0 {
        return Err(ParseError::EmptySheet);
    }

    let (header_row, object_columns) = detect_header(&sheet)?;
    let object_count = object_columns.len() as u16;

    let mut warnings = Vec::new();
    let objects = object_columns
        .iter()
        .map(|column| TechnologicalObject {
            key: column.key.clone(),
            label: column.label.clone(),
            order: column.order,
        })
        .collect::<Vec<_>>();

    let mut measurements = Vec::new();

    for row_idx in (header_row + 1)..sheet.height() {
        let test_name_raw = cell_to_string(sheet.get_value((row_idx as u32, 0)));
        if is_service_row(&test_name_raw) {
            break;
        }

        let mut values = Vec::with_capacity(object_columns.len());
        let mut invalid_cell_warnings = Vec::new();
        let mut has_numeric_value = false;

        for column in &object_columns {
            let (value, raw) = parse_numeric_cell(sheet.get_value((
                row_idx as u32,
                column.col_idx as u32,
            )));
            if value.is_some() {
                has_numeric_value = true;
            } else if !raw.trim().is_empty() {
                invalid_cell_warnings.push(format!(
                    "Невалидное значение '{}' в тесте '{}' (объект '{}')",
                    raw, test_name_raw, column.label
                ));
            }
            values.push(ObjectValue {
                object_key: column.key.clone(),
                object_label: column.label.clone(),
                object_order: column.order,
                value,
                raw_value: raw,
            });
        }

        if !has_numeric_value {
            continue;
        }

        warnings.extend(invalid_cell_warnings);
        measurements.push(Measurement {
            test_name: normalizer.normalize(&test_name_raw),
            test_name_raw,
            values,
        });
    }

    if measurements.is_empty() {
        return Err(ParseError::EmptySheet);
    }

    let status = if warnings.is_empty() {
        FileStatus::Ok
    } else {
        FileStatus::Warning(warnings.clone())
    };

    Ok(ParsedFile {
        date,
        filename,
        status,
        warnings,
        object_count,
        objects,
        measurements,
    })
}

pub fn parse_date_from_filename(path: &Path) -> Result<NaiveDate, ParseError> {
    let file_name = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .ok_or(ParseError::InvalidFilename)?;

    let capture = FILENAME_DATE_RE
        .captures(&file_name)
        .ok_or(ParseError::InvalidFilename)?;

    let day = capture
        .name("day")
        .and_then(|v| v.as_str().parse::<u32>().ok())
        .ok_or(ParseError::InvalidFilename)?;
    let month = capture
        .name("month")
        .and_then(|v| v.as_str().parse::<u32>().ok())
        .ok_or(ParseError::InvalidFilename)?;
    let year = capture
        .name("year")
        .and_then(|v| v.as_str().parse::<i32>().ok())
        .ok_or(ParseError::InvalidFilename)?;

    NaiveDate::from_ymd_opt(year, month, day).ok_or(ParseError::InvalidFilename)
}

#[cfg(test)]
mod tests {
    use super::parse_date_from_filename;
    use std::path::Path;

    #[test]
    fn parses_date_with_underscore() {
        let date = parse_date_from_filename(Path::new("12_03_2024.xlsx")).expect("date must parse");
        assert_eq!(date.to_string(), "2024-03-12");
    }

    #[test]
    fn parses_date_with_dot() {
        let date = parse_date_from_filename(Path::new("12.03.2024.xlsx")).expect("date must parse");
        assert_eq!(date.to_string(), "2024-03-12");
    }
}
