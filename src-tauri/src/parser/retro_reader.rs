//! Parser for retrospective lab-data files: yearly/quarterly workbooks where
//! rows are parameters, columns are calendar months (1..12), and blocks of
//! rows are grouped by year (and, within a year, sometimes by a "Секция 3:"
//! band). This is structurally the transpose of the daily parser
//! (`excel_reader.rs`), which has one file per date and objects as columns.
//!
//! Unlike the daily parser there is no technological-object dimension here
//! — one sheet is one sampling point, and a "Секция N:" band is folded into
//! the parameter name (see `RETRO_OBJECT_KEY`).
//!
//! The parser is a small finite-state machine rather than fixed
//! coordinates, so it tolerates the header starting at a different column
//! per file, year/object blocks repeating any number of times, and a
//! trailing block of derived summary rows (which don't look like a monthly
//! series and are simply not picked up — see `MIN_MONTHLY_POINTS`).

use std::{collections::HashMap, path::Path};

use calamine::{open_workbook_auto, Data, Range, Reader};
use chrono::NaiveDate;
use once_cell::sync::Lazy;
use regex::Regex;

use crate::{
    errors::ParseError,
    models::{FileStatus, RetroFact, RetroParsedFile, RetroPointValue},
    parser::{
        normalizer::NameNormalizer,
        structure::{canonical_object_key, cell_to_string, parse_numeric_cell},
        validator::is_service_row,
    },
};

const HEADER_SCAN_LIMIT: usize = 40;
const MAX_MONTHS: usize = 12;
/// A row must have at least this many populated month cells to be treated
/// as a monthly series rather than a derived/summary annotation (which
/// typically has exactly one value, sharing a column with month 1 purely by
/// coincidence of layout — see the sample files' trailing ratio tables).
const MIN_MONTHLY_POINTS: usize = 2;

static YEAR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"((?:19|20)\d{2})\s*(?:год)").expect("valid regex"));

/// Parses every sheet of a retro workbook. A sheet that doesn't look like a
/// retro table (no month header found, or zero qualifying data rows) is
/// silently skipped rather than reported as an error, since one workbook
/// commonly mixes data sheets with unrelated ones.
pub fn parse_retro_workbook(
    path: &Path,
    normalizer: &NameNormalizer,
) -> Result<Vec<RetroParsedFile>, ParseError> {
    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .ok_or(ParseError::InvalidFilename)?;

    let mut workbook = open_workbook_auto(path)?;
    let sheet_names = workbook.sheet_names();

    let mut results = Vec::new();
    for sheet_name in sheet_names {
        let range = match workbook.worksheet_range(&sheet_name) {
            Ok(range) => range,
            Err(_) => continue,
        };

        match parse_retro_sheet(&range, normalizer) {
            Ok(mut parsed) => {
                parsed.filename = format!("{filename}::{sheet_name}");
                results.push(parsed);
            }
            Err(ParseError::EmptySheet) | Err(ParseError::NoObjectsDetected) => continue,
            Err(error) => {
                results.push(RetroParsedFile::error(
                    format!("{filename}::{sheet_name}"),
                    sheet_name.clone(),
                    error.to_string(),
                ));
            }
        }
    }

    if results.is_empty() {
        return Err(ParseError::EmptySheet);
    }

    Ok(results)
}

/// Never fails: a workbook-level error (can't open the file at all) becomes
/// a single error entry, matching `parser::parse_file_safe`'s convention
/// for the daily parser.
pub fn parse_retro_workbook_safe(path: &Path, normalizer: &NameNormalizer) -> Vec<RetroParsedFile> {
    match parse_retro_workbook(path, normalizer) {
        Ok(results) => results,
        Err(error) => {
            let filename = path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown.xlsx".to_string());
            vec![RetroParsedFile::error(filename.clone(), filename, error.to_string())]
        }
    }
}

fn parse_retro_sheet(sheet: &Range<Data>, normalizer: &NameNormalizer) -> Result<RetroParsedFile, ParseError> {
    if sheet.height() == 0 || sheet.width() == 0 {
        return Err(ParseError::EmptySheet);
    }

    let Some((header_row, month_col_start, month_count)) = detect_month_header(sheet) else {
        return Err(ParseError::NoObjectsDetected);
    };
    // The label always sits directly left of month 1 — but that isn't
    // necessarily column 0: file 1 has an extra "№ п/п" row-number column
    // before the parameter name, shifting everything one column right.
    let label_col = month_col_start.saturating_sub(1);

    let title = detect_title(sheet, header_row);
    let header_hint = cell_to_string(sheet.get_value((header_row as u32, label_col as u32)));
    let (direction, site) = classify_retro_direction_and_site(&format!("{title} {header_hint}"));
    let facts = extract_retro_facts(sheet, header_row, label_col);
    let source_label = describe_retro_source(direction, site);

    let mut warnings = Vec::new();
    let mut points = Vec::new();
    // A "Секция N:" band inside a sheet is *not* a technological object in
    // retro mode (retro files describe sampling points, not the plant's
    // physical lines — see `RETRO_OBJECT_KEY`). It is folded into the
    // parameter name instead, so two sections of one sheet become two
    // parameters the user can pick side by side.
    let mut current_section: Option<String> = None;
    let mut current_year: Option<i32> = None;

    for row_idx in (header_row + 1)..sheet.height() {
        let first_cell = cell_to_string(sheet.get_value((row_idx as u32, label_col as u32)));
        let label = normalize_label(&first_cell);
        let label = label.as_str();

        let row_text = collect_row_text(sheet, row_idx);
        if let Some(year) = extract_year(&row_text) {
            current_year = Some(year);
            continue;
        }

        if let Some(section_label) = label.strip_suffix(':') {
            let has_month_value = (0..month_count).any(|offset| {
                let col = month_col_start + offset;
                parse_numeric_cell(sheet.get_value((row_idx as u32, col as u32)))
                    .0
                    .is_some()
            });
            if !has_month_value {
                current_section = normalize_section_label(section_label);
                continue;
            }
        }

        if label.is_empty() || is_service_row(label) {
            continue;
        }

        let mut month_cells = Vec::with_capacity(month_count);
        let mut numeric_count = 0usize;
        for offset in 0..month_count {
            let col = month_col_start + offset;
            let (value, raw) = parse_numeric_cell(sheet.get_value((row_idx as u32, col as u32)));
            if value.is_some() {
                numeric_count += 1;
            }
            month_cells.push((offset, value, raw));
        }

        if numeric_count < MIN_MONTHLY_POINTS {
            continue;
        }

        let Some(year) = current_year else {
            warnings.push(format!(
                "Строка {}: не удалось определить год для показателя '{}' — строка пропущена",
                row_idx + 1,
                label
            ));
            continue;
        };

        // The unit is split off the parameter name so that the *identity*
        // of a parameter never depends on how its unit happened to be
        // typed — these workbooks spell the same parameter "Фосфор общий,
        // мг/дм3" in one year block and "Фосфор общий, мг/дм" in the next,
        // which used to surface as two half-empty parameters.
        let (base_name, unit) = split_label_and_unit(label);
        let suffix = match &current_section {
            Some(section) => format!(" на {direction} {site} · {section}"),
            None => format!(" на {direction} {site}"),
        };
        let identity = format!("{base_name}{suffix}");
        let display = match &unit {
            Some(unit) => format!("{base_name}, {unit}{suffix}"),
            None => identity.clone(),
        };
        let canonical = normalizer.normalize(&identity);

        for (offset, value, raw_value) in month_cells {
            let month = (offset + 1) as u32;
            let Some(period_date) = NaiveDate::from_ymd_opt(year, month, 1) else {
                continue;
            };
            points.push(RetroPointValue {
                test_name: canonical.clone(),
                test_name_raw: display.clone(),
                period_date,
                value,
                raw_value,
            });
        }
    }

    if points.is_empty() {
        return Err(ParseError::EmptySheet);
    }

    merge_near_duplicate_parameters(&mut points);

    let status = if warnings.is_empty() {
        FileStatus::Ok
    } else {
        FileStatus::Warning(warnings.clone())
    };

    Ok(RetroParsedFile {
        filename: String::new(), // filled in by the caller with "<file>::<sheet>"
        title,
        source_label,
        status,
        warnings,
        facts,
        points,
    })
}

/// Collapses parameters of one sheet that differ only by a typo, keeping
/// the most complete spelling. Two sources of split series in these
/// workbooks: a differently typed unit (handled by `split_label_and_unit`,
/// which leaves the *display* names differing — the longest wins here) and
/// a name with characters dropped ("...в зонах аэраци" vs "...в зонах
/// аэрации").
///
/// Only *dropped characters* count as a typo: the shorter name must be the
/// longer one with up to two characters removed. A substitution is never a
/// typo here, because that is exactly what tells two real parameters apart
/// — "Нитрит-ион" and "Нитрат-ион" are one substitution apart and are
/// different determinations. Digit sequences must match for the same
/// reason ("Секция 1" is never merged into "Секция 2").
fn merge_near_duplicate_parameters(points: &mut [RetroPointValue]) {
    let mut best_display = HashMap::<String, String>::new();
    for point in points.iter() {
        best_display
            .entry(point.test_name.clone())
            .and_modify(|current| {
                if point.test_name_raw.chars().count() > current.chars().count() {
                    *current = point.test_name_raw.clone();
                }
            })
            .or_insert_with(|| point.test_name_raw.clone());
    }

    let mut names: Vec<String> = best_display.keys().cloned().collect();
    names.sort();

    let mut canonical_of = HashMap::<String, String>::new();
    for (index, name) in names.iter().enumerate() {
        for other in names.iter().skip(index + 1) {
            if digits_of(name) != digits_of(other) {
                continue;
            }
            let (short, long) = if other.chars().count() > name.chars().count() {
                (name, other)
            } else {
                (other, name)
            };
            if is_truncation_of(short, long) {
                canonical_of.insert(short.clone(), long.clone());
            }
        }
    }

    for point in points.iter_mut() {
        if let Some(target) = canonical_of.get(&point.test_name) {
            point.test_name = target.clone();
        }
        if let Some(display) = best_display.get(&point.test_name) {
            point.test_name_raw = display.clone();
        }
    }
}

fn digits_of(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// True when `short` is `long` with one or two characters dropped — i.e. a
/// subsequence that is 1..=2 characters shorter.
fn is_truncation_of(short: &str, long: &str) -> bool {
    let dropped = long.chars().count().checked_sub(short.chars().count());
    if !matches!(dropped, Some(1) | Some(2)) {
        return false;
    }

    let mut long_chars = long.chars();
    for expected in short.chars() {
        if !long_chars.any(|actual| actual == expected) {
            return false;
        }
    }
    true
}

/// Splits "Взвешенные вещества, мг/дм3" into ("Взвешенные вещества",
/// Some("мг/дм3")). Deliberately conservative: only a comma-separated tail
/// that actually looks like a unit is split off, so a parameter whose name
/// legitimately contains a comma keeps it.
fn split_label_and_unit(label: &str) -> (String, Option<String>) {
    let Some(comma) = label.rfind(',') else {
        return (label.trim().to_string(), None);
    };
    let (name, tail) = label.split_at(comma);
    let tail = tail[1..].trim();
    if !looks_like_unit(tail) {
        return (label.trim().to_string(), None);
    }
    let name = name.trim();
    if name.is_empty() {
        return (label.trim().to_string(), None);
    }
    (name.to_string(), Some(tail.to_string()))
}

fn looks_like_unit(text: &str) -> bool {
    let length = text.chars().count();
    if length == 0 || length > 20 {
        return false;
    }
    let lower = text.to_lowercase();
    lower.contains('/') || lower.contains('%') || lower.starts_with("ед.") || lower.starts_with("ед ")
}

/// "Секция 3" from a "Секция 3:" band header. The same band is spelled
/// differently between year blocks in the real workbooks ("Секция 3:" in
/// the earlier years, "Секция 3 >>> 1 :" in a later one); both must yield
/// the one label, or the band's series is split into two parameters that
/// each cover part of the period. Returns `None` for a header that carries
/// no text of its own.
fn normalize_section_label(label: &str) -> Option<String> {
    let cleaned = normalize_label(label.trim().trim_end_matches([':', '-', '—']).trim());
    if cleaned.is_empty() {
        return None;
    }

    let number = canonical_object_key(&cleaned.to_lowercase());
    let kind = cleaned
        .split_whitespace()
        .find(|token| token.chars().all(|ch| ch.is_alphabetic()));
    match (kind, number.chars().all(|ch| ch.is_ascii_digit())) {
        (Some(kind), true) => Some(format!("{kind} {number}")),
        _ => Some(cleaned),
    }
}

/// Scans for the row containing a literal ascending "1, 2, 3, ..." run
/// (the month header), trying every plausible starting column since the
/// label column width differs between files. Requires at least half a year
/// of contiguous months to avoid matching an unrelated numeric run.
fn detect_month_header(sheet: &Range<Data>) -> Option<(usize, usize, usize)> {
    let height = sheet.height();
    let width = sheet.width();
    let scan_upto = height.min(HEADER_SCAN_LIMIT);

    for row_idx in 0..scan_upto {
        for start_col in 1..width {
            let mut month_count = 0usize;
            for offset in 0..MAX_MONTHS {
                let col = start_col + offset;
                if col >= width {
                    break;
                }
                let (value, _raw) = parse_numeric_cell(sheet.get_value((row_idx as u32, col as u32)));
                match value {
                    Some(v) if (v - (offset as f64 + 1.0)).abs() < 1e-9 => month_count += 1,
                    _ => break,
                }
            }
            if month_count >= 6 {
                return Some((row_idx, start_col, month_count));
            }
        }
    }

    None
}

/// The nearest text-only row (no numeric values anywhere) directly above
/// the month header — this is the sheet's descriptive title in both sample
/// files, whether it sits right above the header (file 2) or several rows
/// above it, past a block of standalone constants (file 1 has none above
/// it; file 2's title row follows a block of facts).
fn detect_title(sheet: &Range<Data>, header_row: usize) -> String {
    let mut title = String::new();
    for row_idx in 0..header_row {
        let has_numeric = (0..sheet.width())
            .any(|col| parse_numeric_cell(sheet.get_value((row_idx as u32, col as u32))).0.is_some());
        if has_numeric {
            continue;
        }
        let text = cell_to_string(sheet.get_value((row_idx as u32, 0)));
        if !text.trim().is_empty() {
            title = text.trim().to_string();
        }
    }
    title
}

/// Extracts standalone "label = single value" rows found above the month
/// header (object passport data, e.g. working volume, design temperature)
/// into `retro_facts` instead of trying to fit them into the monthly grid.
/// Only rows with a genuinely numeric value count — a title row's trailing
/// text hint (e.g. "Вход на ОС" in a far-right cell) must not turn into a
/// spurious fact.
fn extract_retro_facts(sheet: &Range<Data>, header_row: usize, label_col: usize) -> Vec<RetroFact> {
    let width = sheet.width();
    let mut facts = Vec::new();

    for row_idx in 0..header_row {
        let label_raw = cell_to_string(sheet.get_value((row_idx as u32, label_col as u32)));
        let label = normalize_label(&label_raw);
        if label.is_empty() || is_service_row(&label) || YEAR_RE.is_match(&label) {
            continue;
        }

        let mut found: Option<(f64, String)> = None;
        for col in (label_col + 1)..width {
            let (value, raw) = parse_numeric_cell(sheet.get_value((row_idx as u32, col as u32)));
            if let Some(value) = value {
                found = Some((value, raw));
                break;
            }
        }

        if let Some((value, raw_value)) = found {
            facts.push(RetroFact {
                label,
                value: Some(value),
                raw_value,
            });
        }
    }

    facts
}

/// Collapses interior whitespace runs (common copy/paste artifact in these
/// spreadsheets — the same parameter name is sometimes padded with a
/// different number of spaces in different year blocks) so occurrences of
/// the same parameter always produce the same raw display name.
fn normalize_label(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Classifies a sheet's water-flow direction and treatment-plant site from
/// its title/header text. The site token is deliberately a fixed category
/// ("ОС" for the whole-plant inlet/outlet pair, "БО" for the intermediate
/// biological-treatment-inlet stage) rather than whatever abbreviation the
/// source text happens to use ("ОС" / "КОС" refer to the same plant in the
/// sample files but are not string-identical) — auto-pairing input/output
/// test names (see src/lib/parameter-links.ts) depends on both ends
/// producing the exact same site token.
fn classify_retro_direction_and_site(text: &str) -> (&'static str, &'static str) {
    let lower = text.to_lowercase();
    let is_bo_stage =
        lower.contains("биологическую очистку") || lower.contains("отстойник") || lower.contains("бо и");
    let site = if is_bo_stage { "БО" } else { "ОС" };
    let direction = if lower.contains("выход") || lower.contains("сбрасыва") {
        "выходе"
    } else {
        "входе"
    };
    (direction, site)
}

fn describe_retro_source(direction: &str, site: &str) -> String {
    if direction == "выходе" {
        format!("Выход {site}")
    } else {
        format!("Вход {site}")
    }
}

fn extract_year(row_text: &str) -> Option<i32> {
    YEAR_RE
        .captures(row_text)
        .and_then(|captures| captures.get(1))
        .and_then(|group| group.as_str().parse::<i32>().ok())
}

fn collect_row_text(sheet: &Range<Data>, row_idx: usize) -> String {
    (0..sheet.width())
        .map(|col| cell_to_string(sheet.get_value((row_idx as u32, col as u32))))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use calamine::{Cell, Data, Range};

    use super::{classify_retro_direction_and_site, parse_retro_sheet, split_label_and_unit};
    use crate::{models::FileStatus, parser::normalizer::NameNormalizer};

    fn cell(row: u32, col: u32, value: &str) -> Cell<Data> {
        Cell::new((row, col), Data::String(value.to_string()))
    }

    fn numeric_cell(row: u32, col: u32, value: f64) -> Cell<Data> {
        Cell::new((row, col), Data::Float(value))
    }

    /// Builds a one-sheet retro table: a title row, a 1..6 month header at
    /// column 1, then the given (label, values) rows under a single year.
    fn sheet_with_rows(title: &str, year: &str, rows: &[(&str, [f64; 6])]) -> Range<Data> {
        let mut cells = vec![cell(0, 0, title)];
        for offset in 0..6u32 {
            cells.push(numeric_cell(1, offset + 1, offset as f64 + 1.0));
        }
        cells.push(cell(2, 0, year));
        for (index, (label, values)) in rows.iter().enumerate() {
            let row = 3 + index as u32;
            cells.push(cell(row, 0, label));
            for (offset, value) in values.iter().enumerate() {
                cells.push(numeric_cell(row, offset as u32 + 1, *value));
            }
        }
        Range::from_sparse(cells)
    }

    #[test]
    fn classifies_input_and_output_with_the_same_site_token() {
        let (dir_in, site_in) =
            classify_retro_direction_and_site("...поступающих на очистные сооружения... (вход на ОС)");
        let (dir_out, site_out) =
            classify_retro_direction_and_site("...сбрасываемых с Очистных Сооружений... (выход с КОС)");
        assert_eq!(dir_in, "входе");
        assert_eq!(dir_out, "выходе");
        assert_eq!(
            site_in, site_out,
            "input/output must share one site token so parameter auto-linking pairs them"
        );
    }

    #[test]
    fn classifies_intermediate_stage_with_a_distinct_site_token() {
        let (_, site_stage) = classify_retro_direction_and_site(
            "...поступающих на Биологическую Очистку - после первичных отстойников (Аэротенк)",
        );
        let (_, site_plant) =
            classify_retro_direction_and_site("...поступающих на очистные сооружения... (вход на ОС)");
        assert_ne!(
            site_stage, site_plant,
            "the intermediate stage is its own sampling point and must not be paired with the plant inlet"
        );
    }

    #[test]
    fn splits_a_unit_off_the_parameter_name_only_when_it_looks_like_one() {
        assert_eq!(
            split_label_and_unit("Взвешенные вещества, мг/дм3"),
            ("Взвешенные вещества".to_string(), Some("мг/дм3".to_string()))
        );
        assert_eq!(
            split_label_and_unit("Водородный показатель, ед.рН"),
            ("Водородный показатель".to_string(), Some("ед.рН".to_string()))
        );
        assert_eq!(
            split_label_and_unit("Азот общий, в том числе нитраты"),
            ("Азот общий, в том числе нитраты".to_string(), None)
        );
        assert_eq!(
            split_label_and_unit("Зольность ила %"),
            ("Зольность ила %".to_string(), None)
        );
    }

    #[test]
    fn one_parameter_typed_with_two_different_units_stays_one_series() {
        // The real workbooks spell the same parameter "Фосфор общий, мг/дм3"
        // in one year block and "Фосфор общий, мг/дм" in another; that must
        // not split into two half-empty parameters.
        let sheet = sheet_with_rows(
            "Качественная характеристика сточных вод (вход на ОС)",
            "2023 год",
            &[
                ("Фосфор общий, мг/дм3", [5.3, 5.6, 5.2, 6.7, 5.6, 5.8]),
                ("Фосфор общий, мг/дм", [4.3, 4.6, 4.2, 4.7, 4.6, 4.8]),
            ],
        );
        let parsed = parse_retro_sheet(&sheet, &NameNormalizer::default()).expect("parsed sheet");

        let names: std::collections::BTreeSet<&str> =
            parsed.points.iter().map(|p| p.test_name.as_str()).collect();
        assert_eq!(names.len(), 1, "both spellings must land on one parameter");
        assert!(
            parsed
                .points
                .iter()
                .all(|p| p.test_name_raw == "Фосфор общий, мг/дм3 на входе ОС"),
            "the most complete spelling wins as the display name"
        );
    }

    #[test]
    fn a_truncated_parameter_name_merges_but_a_substitution_never_does() {
        let sheet = sheet_with_rows(
            "Технологические параметры (вход на БО)",
            "2023 год",
            &[
                ("Концентрация кислорода в зонах аэрации мг/л", [1.0, 1.1, 1.2, 1.3, 1.4, 1.5]),
                // Same parameter with two characters dropped — one series.
                ("Концентрация кислорода в зонах аэраци мг/л", [2.0, 2.1, 2.2, 2.3, 2.4, 2.5]),
                // One letter apart, but genuinely different determinations.
                ("Нитрит-ион, мгN/дм3", [0.22, 0.18, 0.13, 0.16, 0.12, 0.11]),
                ("Нитрат-ион, мгN/дм3", [0.498, 0.52, 0.554, 0.428, 0.46, 0.41]),
                // Told apart by their number, not their letters.
                ("Хром 6, мг/дм3", [0.02, 0.02, 0.03, 0.02, 0.02, 0.03]),
                ("Хром 3, мг/дм3", [0.01, 0.01, 0.01, 0.01, 0.01, 0.01]),
            ],
        );
        let parsed = parse_retro_sheet(&sheet, &NameNormalizer::default()).expect("parsed sheet");

        let names: std::collections::BTreeSet<&str> =
            parsed.points.iter().map(|p| p.test_name.as_str()).collect();
        assert_eq!(
            names.len(),
            5,
            "only the truncated spelling merges; нитрит/нитрат and хром 6/3 stay apart: {names:?}"
        );
        assert!(
            names.iter().any(|name| name.starts_with("нитрит-ион")),
            "нитрит must survive: {names:?}"
        );
        assert!(
            names.iter().any(|name| name.starts_with("нитрат-ион")),
            "нитрат must survive: {names:?}"
        );
    }

    #[test]
    fn a_section_band_becomes_part_of_the_parameter_name_not_an_object() {
        let mut cells = vec![cell(0, 0, "Технологические параметры в Секциях Аэротенка")];
        for offset in 0..6u32 {
            cells.push(numeric_cell(1, offset + 1, offset as f64 + 1.0));
        }
        cells.push(cell(2, 0, "2023 год"));
        cells.push(cell(3, 0, "Секция 3:"));
        cells.push(cell(4, 0, "ХПКCr, мг/дм3"));
        for offset in 0..6u32 {
            cells.push(numeric_cell(4, offset + 1, 600.0 + offset as f64));
        }
        cells.push(cell(5, 0, "Секция 4:"));
        cells.push(cell(6, 0, "ХПКCr, мг/дм3"));
        for offset in 0..6u32 {
            cells.push(numeric_cell(6, offset + 1, 500.0 + offset as f64));
        }

        let sheet = Range::from_sparse(cells);
        let parsed = parse_retro_sheet(&sheet, &NameNormalizer::default()).expect("parsed sheet");

        let names: std::collections::BTreeSet<&str> =
            parsed.points.iter().map(|p| p.test_name_raw.as_str()).collect();
        assert_eq!(
            names.iter().copied().collect::<Vec<_>>(),
            vec![
                "ХПКCr, мг/дм3 на входе ОС · Секция 3",
                "ХПКCr, мг/дм3 на входе ОС · Секция 4",
            ],
            "each section must be selectable as its own parameter"
        );
    }

    #[test]
    fn parses_repeating_year_blocks() {
        let mut cells = vec![cell(0, 0, "Параметр на входе БО и в Секции / месяцы года:")];
        for offset in 0..12u32 {
            cells.push(numeric_cell(0, offset + 1, offset as f64 + 1.0));
        }
        cells.push(cell(1, 0, "2023 год (предоставленные ретроспективные данные)"));
        cells.push(cell(2, 0, "ХПКCr, мг/дм3"));
        for (offset, value) in [
            652.0, 444.0, 595.0, 624.0, 634.0, 470.0, 611.0, 494.0, 557.0, 633.0, 609.0, 663.0,
        ]
        .into_iter()
        .enumerate()
        {
            cells.push(numeric_cell(2, (offset + 1) as u32, value));
        }
        cells.push(cell(3, 0, "2024 год (предоставленные ретроспективные данные)"));
        cells.push(cell(4, 0, "ХПКCr, мг/дм3"));
        for (offset, value) in [
            498.0, 424.0, 437.0, 392.0, 538.0, 758.0, 688.0, 702.0, 662.0, 600.0, 602.5, 603.5,
        ]
        .into_iter()
        .enumerate()
        {
            cells.push(numeric_cell(4, (offset + 1) as u32, value));
        }

        let sheet = Range::from_sparse(cells);
        let parsed = parse_retro_sheet(&sheet, &NameNormalizer::default()).expect("parsed sheet");

        assert_eq!(parsed.points.len(), 24, "12 months x 2 years");
        assert!(matches!(parsed.status, FileStatus::Ok));

        let jan2023 = parsed
            .points
            .iter()
            .find(|p| p.period_date.to_string() == "2023-01-01")
            .expect("january 2023 point");
        assert_eq!(jan2023.value, Some(652.0));
        assert!(jan2023.test_name_raw.contains("на входе БО"));

        let jan2024 = parsed
            .points
            .iter()
            .find(|p| p.period_date.to_string() == "2024-01-01")
            .expect("january 2024 point");
        assert_eq!(jan2024.value, Some(498.0));
    }

    #[test]
    fn ignores_single_value_summary_rows_below_the_month_band() {
        let mut cells = vec![cell(0, 0, "Параметр / месяцы года:")];
        for offset in 0..6u32 {
            cells.push(numeric_cell(0, offset + 1, offset as f64 + 1.0));
        }
        cells.push(cell(1, 0, "2023 год"));
        cells.push(cell(2, 0, "Секция 1:"));
        cells.push(cell(3, 0, "БПК 5-суточное"));
        for offset in 0..6u32 {
            cells.push(numeric_cell(3, offset + 1, 100.0 + offset as f64));
        }
        // Summary row: a single value sharing a column with month 1 — must not be parsed.
        cells.push(cell(4, 0, "Требуемая доза при средневзвешенной нагрузке"));
        cells.push(numeric_cell(4, 1, 2.9));

        let sheet = Range::from_sparse(cells);
        let parsed = parse_retro_sheet(&sheet, &NameNormalizer::default()).expect("parsed sheet");

        assert!(
            parsed
                .points
                .iter()
                .all(|p| !p.test_name_raw.contains("Требуемая доза")),
            "single-value summary row must not become a measurement"
        );
    }
}
