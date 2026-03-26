use std::collections::HashSet;

use calamine::{Data, Range};
use once_cell::sync::Lazy;
use regex::Regex;

use crate::errors::ParseError;

const HEADER_SCAN_LIMIT: usize = 32;
const MIN_HEADER_OBJECTS: usize = 3;
const MAX_OBJECT_LABEL_LEN: usize = 64;
const MAX_NUMERIC_OBJECT: u16 = 128;

static OBJECT_NUMBER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?iu)(?:^|[^\d])(?:â„–|#)?\s*(\d{1,3})(?:$|[^\d])").expect("valid regex")
});

#[derive(Debug, Clone)]
pub struct HeaderObjectColumn {
    pub key: String,
    pub label: String,
    pub order: u16,
    pub col_idx: usize,
}

pub fn detect_header(
    sheet: &Range<Data>,
) -> Result<(usize, Vec<HeaderObjectColumn>), ParseError> {
    let height = sheet.height();
    let width = sheet.width();
    if height == 0 || width == 0 {
        return Err(ParseError::EmptySheet);
    }

    let scan_upto = height.min(HEADER_SCAN_LIMIT);
    let mut best: Option<(usize, Vec<HeaderObjectColumn>, usize)> = None;

    for row_idx in 0..scan_upto {
        let header_hint_text = cell_to_string(sheet.get_value((row_idx as u32, 0)));
        let has_header_hint = is_header_row_hint(&header_hint_text);

        let mut object_columns = Vec::new();
        let mut seen_keys = HashSet::new();
        let mut numeric_labels = 0usize;

        for col_idx in 1..width {
            let raw = cell_to_string(sheet.get_value((row_idx as u32, col_idx as u32)));
            match parse_object_header_cell(&raw) {
                HeaderCellParse::Stop => break,
                HeaderCellParse::Skip => continue,
                HeaderCellParse::Object { key, label, numeric } => {
                    if seen_keys.insert(key.clone()) {
                        numeric_labels += usize::from(numeric);
                        object_columns.push(HeaderObjectColumn {
                            key,
                            label,
                            order: 0,
                            col_idx,
                        });
                    }
                }
            }
        }

        if object_columns.len() < MIN_HEADER_OBJECTS {
            continue;
        }

        object_columns.sort_by_key(|item| item.col_idx);
        for (index, item) in object_columns.iter_mut().enumerate() {
            item.order = (index + 1) as u16;
        }

        let continuity = continuity_score(&object_columns);
        let early_bonus = (scan_upto.saturating_sub(row_idx)) / 2;
        let score = object_columns.len() * 4
            + continuity * 3
            + numeric_labels
            + early_bonus
            + usize::from(has_header_hint) * 12;

        match best {
            Some((_, _, best_score)) if best_score >= score => {}
            _ => {
                best = Some((row_idx, object_columns, score));
            }
        }
    }

    if let Some((row, cols, _)) = best {
        return Ok((row, cols));
    }

    Err(ParseError::NoObjectsDetected)
}

pub fn cell_to_string(cell: Option<&Data>) -> String {
    match cell {
        Some(Data::String(value)) => value.trim().to_string(),
        Some(Data::Float(value)) => {
            if value.fract() == 0.0 {
                format!("{value:.0}")
            } else {
                value.to_string()
            }
        }
        Some(Data::Int(value)) => value.to_string(),
        Some(Data::Bool(value)) => value.to_string(),
        Some(Data::DateTime(value)) => value.to_string(),
        Some(Data::DateTimeIso(value)) => value.clone(),
        Some(Data::DurationIso(value)) => value.clone(),
        Some(Data::Error(_)) | Some(Data::Empty) | None => String::new(),
    }
}

pub fn parse_numeric_cell(cell: Option<&Data>) -> (Option<f64>, String) {
    let raw = cell_to_string(cell);
    if raw.is_empty() {
        return (None, raw);
    }

    if let Some(data) = cell {
        match data {
            Data::Float(value) => return (Some(*value), raw),
            Data::Int(value) => return (Some(*value as f64), raw),
            _ => {}
        }
    }

    let normalized = raw.replace(',', ".").replace(' ', "");
    match normalized.parse::<f64>() {
        Ok(value) => (Some(value), raw),
        Err(_) => (None, raw),
    }
}

enum HeaderCellParse {
    Stop,
    Skip,
    Object {
        key: String,
        label: String,
        numeric: bool,
    },
}

fn parse_object_header_cell(raw: &str) -> HeaderCellParse {
    let label = normalize_header_label(raw);
    if label.is_empty() {
        return HeaderCellParse::Skip;
    }

    let lower = label.to_lowercase();
    if is_service_header_marker(&lower) {
        return HeaderCellParse::Stop;
    }

    if lower.contains('/') || lower.contains("Ð¼Ð³/Ð»") || lower.contains("Ð³Ñ€/Ð»") {
        return HeaderCellParse::Skip;
    }

    if label.len() > MAX_OBJECT_LABEL_LEN {
        return HeaderCellParse::Skip;
    }

    if looks_like_decimal_number(&label) {
        return HeaderCellParse::Skip;
    }

    if let Some(number) = extract_object_number(&label) {
        return HeaderCellParse::Object {
            key: number.to_string(),
            label: if label.chars().all(|ch| ch.is_ascii_digit()) {
                number.to_string()
            } else {
                label
            },
            numeric: true,
        };
    }

    let alpha_count = lower.chars().filter(|ch| ch.is_alphabetic()).count();
    if alpha_count == 0 {
        return HeaderCellParse::Skip;
    }

    HeaderCellParse::Object {
        key: canonical_object_key(&lower),
        label,
        numeric: false,
    }
}

fn normalize_header_label(value: &str) -> String {
    value
        .trim_matches(|ch: char| ch == '"' || ch == '\'' || ch.is_whitespace())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_object_number(value: &str) -> Option<u16> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return None;
    }

    if normalized.chars().all(|ch| ch.is_ascii_digit()) {
        let number = normalized.parse::<u16>().ok()?;
        return (1..=MAX_NUMERIC_OBJECT).contains(&number).then_some(number);
    }

    let captures = OBJECT_NUMBER_RE.captures(normalized)?;
    let number = captures.get(1)?.as_str().parse::<u16>().ok()?;
    (1..=MAX_NUMERIC_OBJECT).contains(&number).then_some(number)
}

fn canonical_object_key(value: &str) -> String {
    if let Some(number) = extract_object_number(value) {
        return number.to_string();
    }

    let mut key = String::with_capacity(value.len());
    let mut previous_underscore = false;

    for ch in value.chars() {
        if ch.is_alphanumeric() {
            previous_underscore = false;
            key.push(ch);
            continue;
        }

        if !previous_underscore {
            key.push('_');
            previous_underscore = true;
        }
    }

    let key = key.trim_matches('_').to_string();
    if key.is_empty() {
        "object".to_string()
    } else {
        key
    }
}

fn looks_like_decimal_number(value: &str) -> bool {
    let normalized = value.replace(',', ".").replace(' ', "");
    let has_separator = normalized.contains('.');
    has_separator && normalized.parse::<f64>().is_ok()
}

fn is_service_header_marker(value: &str) -> bool {
    value.contains("Ð¿Ñ€Ð¾ÐµÐºÑ‚Ð½Ñ‹Ðµ Ð¿Ð°Ñ€Ð°Ð¼ÐµÑ‚")
        || value.contains("ÑÐ»ÑƒÐ¶ÐµÐ±Ð½Ð°Ñ Ð¸Ð½Ñ„Ð¾Ñ€Ð¼Ð°Ñ†")
        || value.contains("Ð³Ð°Ð±Ð°Ñ€Ð¸Ñ‚")
}

fn is_header_row_hint(value: &str) -> bool {
    let normalized = value.to_lowercase();
    normalized.contains("Ð½Ð¾Ð¼ÐµÑ€")
        || normalized.contains("Ð¾Ð±ÑŠÐµÐºÑ‚")
        || normalized.contains("Ð°ÑÑ€Ð¾Ñ‚ÐµÐ½Ðº")
        || normalized.contains("Ñ‚Ð°Ð½Ðº")
        || normalized.contains("lab")
}

fn continuity_score(columns: &[HeaderObjectColumn]) -> usize {
    if columns.len() <= 1 {
        return columns.len();
    }

    let mut score = 1usize;
    for window in columns.windows(2) {
        if let [left, right] = window {
            if right.col_idx <= left.col_idx + 1 {
                score += 1;
            }
        }
    }
    score
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_object_key, extract_object_number, parse_object_header_cell, HeaderCellParse,
    };

    #[test]
    fn extracts_numeric_object() {
        assert_eq!(extract_object_number("8"), Some(8));
        assert_eq!(extract_object_number("ÐÑÑ€Ð¾Ñ‚ÐµÐ½Ðº 7"), Some(7));
    }

    #[test]
    fn rejects_large_numeric_value() {
        assert_eq!(extract_object_number("2304"), None);
    }

    #[test]
    fn builds_text_key() {
        assert_eq!(canonical_object_key("tank #1"), "1".to_string());
        assert_eq!(
            canonical_object_key("main grate"),
            "main_grate".to_string()
        );
    }

    #[test]
    fn treats_average_header_as_regular_object_column() {
        let parsed = parse_object_header_cell("Average");
        assert!(matches!(parsed, HeaderCellParse::Object { .. }));
    }
}

