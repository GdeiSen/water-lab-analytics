use std::path::Path;

use calamine::{open_workbook_auto, Data, Range, Reader};
use chrono::NaiveDate;
use once_cell::sync::Lazy;
use regex::Regex;

use crate::{
    errors::ParseError,
    models::{FileStatus, Measurement, ObjectValue, ParsedFile, TechnologicalObject},
    parser::{
        normalizer::NameNormalizer,
        structure::{cell_to_string, detect_header, parse_numeric_cell, HeaderObjectColumn},
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

    parse_sheet(date, filename, &sheet, normalizer)
}

fn parse_sheet(
    date: NaiveDate,
    filename: String,
    sheet: &Range<Data>,
    normalizer: &NameNormalizer,
) -> Result<ParsedFile, ParseError> {
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

        if test_name_raw.trim().is_empty() {
            if row_has_object_payload(sheet, row_idx, &object_columns) {
                warnings.push(format!(
                    "Нарушение структуры: строка {} содержит значения по объектам без названия испытания и была пропущена",
                    row_idx + 1
                ));
            }
            continue;
        }

        let mut values = Vec::with_capacity(object_columns.len());
        let mut invalid_cell_warnings = Vec::new();
        let mut has_numeric_value = false;

        for column in &object_columns {
            let (value, raw) =
                parse_numeric_cell(sheet.get_value((row_idx as u32, column.col_idx as u32)));
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

fn row_has_object_payload(
    sheet: &Range<Data>,
    row_idx: usize,
    object_columns: &[HeaderObjectColumn],
) -> bool {
    object_columns.iter().any(|column| {
        let raw = cell_to_string(sheet.get_value((row_idx as u32, column.col_idx as u32)));
        !raw.trim().is_empty()
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
    use calamine::{Cell, Data, Range};

    use crate::{models::FileStatus, parser::normalizer::NameNormalizer};

    use super::{parse_date_from_filename, parse_sheet};
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

    #[test]
    fn warns_and_skips_rows_without_test_name() {
        let sheet = Range::from_sparse(vec![
            Cell::new((0, 0), Data::String("Испытание".to_string())),
            Cell::new((0, 1), Data::String("1".to_string())),
            Cell::new((0, 2), Data::String("2".to_string())),
            Cell::new((0, 3), Data::String("3".to_string())),
            Cell::new((1, 0), Data::String("Азот аммонийный".to_string())),
            Cell::new((1, 1), Data::Float(1.0)),
            Cell::new((1, 2), Data::Float(2.0)),
            Cell::new((1, 3), Data::Float(3.0)),
            Cell::new((2, 1), Data::Float(10.0)),
            Cell::new((2, 2), Data::Float(11.0)),
            Cell::new((2, 3), Data::Float(12.0)),
            Cell::new((3, 0), Data::String("Фосфор".to_string())),
            Cell::new((3, 1), Data::Float(4.0)),
            Cell::new((3, 2), Data::Float(5.0)),
            Cell::new((3, 3), Data::Float(6.0)),
        ]);

        let parsed = parse_sheet(
            chrono::NaiveDate::from_ymd_opt(2026, 4, 13).expect("valid date"),
            "13_04_2026.xlsx".to_string(),
            &sheet,
            &NameNormalizer::default(),
        )
        .expect("parsed file");

        assert_eq!(parsed.measurements.len(), 2);
        assert_eq!(parsed.measurements[0].test_name_raw, "Азот аммонийный");
        assert_eq!(parsed.measurements[1].test_name_raw, "Фосфор");
        assert_eq!(parsed.warnings.len(), 1);
        assert!(parsed.warnings[0].contains("строка 3"));
        assert!(parsed.warnings[0].contains("без названия испытания"));
        assert!(matches!(parsed.status, FileStatus::Warning(_)));
    }
}
