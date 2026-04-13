use std::{
    io::{Cursor, Write},
    path::PathBuf,
};

use chrono::Utc;
use serde::Deserialize;
use tauri::State;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{errors::AppError, AppState};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelExportPayload {
    pub worksheet_name: String,
    pub header_rows: Vec<ExcelHeaderRow>,
    pub rows: Vec<Vec<Option<ExcelCellValue>>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelHeaderRow {
    pub cells: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum ExcelCellValue {
    Text(String),
    Number(f64),
    Bool(bool),
}

#[tauri::command]
pub async fn save_export_file(
    session_token: String,
    target_path: String,
    bytes: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_session(&session_token)?;

    let path = PathBuf::from(target_path);
    ensure_parent_directory(&path)?;

    std::fs::write(path, bytes)?;
    Ok(())
}

#[tauri::command]
pub async fn save_excel_export(
    session_token: String,
    target_path: String,
    payload: ExcelExportPayload,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_session(&session_token)?;

    let path = PathBuf::from(target_path);
    ensure_parent_directory(&path)?;

    let bytes = build_excel_bytes(&payload)?;
    std::fs::write(path, bytes)?;
    Ok(())
}

fn ensure_parent_directory(path: &PathBuf) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    Ok(())
}

fn build_excel_bytes(payload: &ExcelExportPayload) -> Result<Vec<u8>, AppError> {
    let sheet_name = sanitize_sheet_name(&payload.worksheet_name);
    let timestamp = Utc::now().to_rfc3339();
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    write_zip_entry(
        &mut writer,
        "[Content_Types].xml",
        &build_content_types_xml(),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "_rels/.rels",
        &build_root_relationships_xml(),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "docProps/app.xml",
        &build_app_properties_xml(),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "docProps/core.xml",
        &build_core_properties_xml(&timestamp),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "xl/workbook.xml",
        &build_workbook_xml(&sheet_name),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "xl/_rels/workbook.xml.rels",
        &build_workbook_relationships_xml(),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "xl/styles.xml",
        &build_styles_xml(),
        options.clone(),
    )?;
    write_zip_entry(
        &mut writer,
        "xl/worksheets/sheet1.xml",
        &build_sheet_xml(payload),
        options,
    )?;

    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(zip_error)
}

fn write_zip_entry(
    writer: &mut ZipWriter<Cursor<Vec<u8>>>,
    name: &str,
    contents: &str,
    options: SimpleFileOptions,
) -> Result<(), AppError> {
    writer.start_file(name, options).map_err(zip_error)?;
    writer.write_all(contents.as_bytes())?;
    Ok(())
}

fn build_content_types_xml() -> String {
    concat!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
        r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">"#,
        r#"<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>"#,
        r#"<Default Extension="xml" ContentType="application/xml"/>"#,
        r#"<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>"#,
        r#"<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#,
        r#"<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>"#,
        r#"<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>"#,
        r#"<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>"#,
        r#"</Types>"#,
    )
    .to_string()
}

fn build_root_relationships_xml() -> String {
    concat!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
        r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
        r#"<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>"#,
        r#"<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>"#,
        r#"<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>"#,
        r#"</Relationships>"#,
    )
    .to_string()
}

fn build_app_properties_xml() -> String {
    concat!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
        r#"<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" "#,
        r#"xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">"#,
        r#"<Application>Water Lab Analytics</Application>"#,
        r#"</Properties>"#,
    )
    .to_string()
}

fn build_core_properties_xml(timestamp: &str) -> String {
    format!(
        concat!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
            r#"<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" "#,
            r#"xmlns:dc="http://purl.org/dc/elements/1.1/" "#,
            r#"xmlns:dcterms="http://purl.org/dc/terms/" "#,
            r#"xmlns:dcmitype="http://purl.org/dc/dcmitype/" "#,
            r#"xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">"#,
            r#"<dc:creator>Water Lab Analytics</dc:creator>"#,
            r#"<cp:lastModifiedBy>Water Lab Analytics</cp:lastModifiedBy>"#,
            r#"<dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>"#,
            r#"<dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>"#,
            r#"</cp:coreProperties>"#,
        ),
        timestamp = escape_xml(timestamp),
    )
}

fn build_workbook_xml(sheet_name: &str) -> String {
    format!(
        concat!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
            r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" "#,
            r#"xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
            r#"<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets>"#,
            r#"</workbook>"#,
        ),
        sheet_name = escape_xml(sheet_name),
    )
}

fn build_workbook_relationships_xml() -> String {
    concat!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
        r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
        r#"<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>"#,
        r#"<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>"#,
        r#"</Relationships>"#,
    )
    .to_string()
}

fn build_styles_xml() -> String {
    concat!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
        r#"<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#,
        r#"<fonts count="2">"#,
        r#"<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>"#,
        r#"<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>"#,
        r#"</fonts>"#,
        r#"<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>"#,
        r#"<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"#,
        r#"<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>"#,
        r#"<cellXfs count="2">"#,
        r#"<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>"#,
        r#"<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>"#,
        r#"</cellXfs>"#,
        r#"<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>"#,
        r#"</styleSheet>"#,
    )
    .to_string()
}

fn build_sheet_xml(payload: &ExcelExportPayload) -> String {
    let column_widths = collect_column_widths(payload);
    let mut rows = Vec::with_capacity(payload.rows.len() + payload.header_rows.len());
    for (row_index, header_row) in payload.header_rows.iter().enumerate() {
        rows.push(build_header_row(row_index + 1, &header_row.cells));
    }

    for (row_index, row) in payload.rows.iter().enumerate() {
        rows.push(build_data_row(payload.header_rows.len() + row_index + 1, row));
    }

    format!(
        concat!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#,
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#,
            r#"<sheetFormatPr defaultRowHeight="15"/>"#,
            r#"{columns}"#,
            r#"<sheetData>{rows}</sheetData>"#,
            r#"</worksheet>"#,
        ),
        columns = build_columns_xml(&column_widths),
        rows = rows.join(""),
    )
}

fn collect_column_widths(payload: &ExcelExportPayload) -> Vec<f64> {
    let mut widths = payload
        .header_rows
        .iter()
        .flat_map(|row| row.cells.iter().enumerate())
        .fold(Vec::<f64>::new(), |mut acc, (index, value)| {
            if acc.len() <= index {
                acc.resize(index + 1, 10.0);
            }
            acc[index] = acc[index].max(approximate_excel_width(value));
            acc
        });

    for row in &payload.rows {
        if row.len() > widths.len() {
            widths.resize(row.len(), 10.0);
        }

        for (index, cell) in row.iter().enumerate() {
            let width = approximate_excel_width(&cell_to_text(cell));
            widths[index] = widths[index].max(width);
        }
    }

    widths
}

fn build_columns_xml(widths: &[f64]) -> String {
    if widths.is_empty() {
        return String::new();
    }

    let columns = widths
        .iter()
        .enumerate()
        .map(|(index, width)| {
            format!(
                r#"<col min="{col}" max="{col}" width="{width}" customWidth="1"/>"#,
                col = index + 1,
                width = width,
            )
        })
        .collect::<Vec<_>>()
        .join("");

    format!("<cols>{columns}</cols>")
}

fn build_header_row(row_number: usize, headers: &[String]) -> String {
    let cells = headers
        .iter()
        .enumerate()
        .map(|(index, value)| build_inline_string_cell(index, row_number, value, Some(1)))
        .collect::<Vec<_>>()
        .join("");

    format!(r#"<row r="{row_number}">{cells}</row>"#)
}

fn build_data_row(row_number: usize, row: &[Option<ExcelCellValue>]) -> String {
    let cells = row
        .iter()
        .enumerate()
        .filter_map(|(column_index, cell)| build_data_cell(column_index, row_number, cell))
        .collect::<Vec<_>>()
        .join("");

    format!(r#"<row r="{row_number}">{cells}</row>"#)
}

fn build_data_cell(
    column_index: usize,
    row_number: usize,
    cell: &Option<ExcelCellValue>,
) -> Option<String> {
    match cell {
        None => None,
        Some(ExcelCellValue::Number(value)) if value.is_finite() => Some(format!(
            r#"<c r="{reference}"><v>{value}</v></c>"#,
            reference = excel_reference(column_index, row_number),
            value = value,
        )),
        Some(ExcelCellValue::Bool(value)) => Some(format!(
            r#"<c r="{reference}" t="b"><v>{raw}</v></c>"#,
            reference = excel_reference(column_index, row_number),
            raw = if *value { 1 } else { 0 },
        )),
        Some(ExcelCellValue::Text(value)) => Some(build_inline_string_cell(
            column_index,
            row_number,
            value,
            None,
        )),
        Some(ExcelCellValue::Number(_)) => None,
    }
}

fn build_inline_string_cell(
    column_index: usize,
    row_number: usize,
    value: &str,
    style_index: Option<u8>,
) -> String {
    let reference = excel_reference(column_index, row_number);
    let style = style_index
        .map(|index| format!(r#" s="{index}""#))
        .unwrap_or_default();
    let preserve_space = requires_space_preservation(value);
    let text = escape_xml(value);

    if preserve_space {
        format!(
            r#"<c r="{reference}" t="inlineStr"{style}><is><t xml:space="preserve">{text}</t></is></c>"#
        )
    } else {
        format!(r#"<c r="{reference}" t="inlineStr"{style}><is><t>{text}</t></is></c>"#)
    }
}

fn excel_reference(column_index: usize, row_number: usize) -> String {
    format!("{}{}", excel_column_name(column_index), row_number)
}

fn excel_column_name(mut index: usize) -> String {
    let mut column = String::new();
    loop {
        let remainder = index % 26;
        column.insert(0, char::from(b'A' + remainder as u8));
        if index < 26 {
            break;
        }
        index = index / 26 - 1;
    }
    column
}

fn sanitize_sheet_name(raw: &str) -> String {
    let cleaned = raw
        .trim()
        .chars()
        .map(|ch| match ch {
            ':' | '\\' | '/' | '?' | '*' | '[' | ']' => '_',
            _ => ch,
        })
        .collect::<String>();

    let limited = cleaned
        .chars()
        .take(31)
        .collect::<String>()
        .trim()
        .to_string();

    if limited.is_empty() || limited.chars().all(|ch| ch == '_') {
        "Sheet1".to_string()
    } else {
        limited
    }
}

fn requires_space_preservation(value: &str) -> bool {
    value.starts_with(' ') || value.ends_with(' ') || value.contains("  ")
}

fn approximate_excel_width(value: &str) -> f64 {
    let width = value.chars().count() as f64 + 2.0;
    width.clamp(10.0, 48.0)
}

fn cell_to_text(cell: &Option<ExcelCellValue>) -> String {
    match cell {
        None => String::new(),
        Some(ExcelCellValue::Text(value)) => value.clone(),
        Some(ExcelCellValue::Number(value)) if value.is_finite() => value.to_string(),
        Some(ExcelCellValue::Number(_)) => String::new(),
        Some(ExcelCellValue::Bool(value)) => value.to_string(),
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::Generic(format!("Ошибка подготовки Excel: {error}"))
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use zip::ZipArchive;

    use super::*;

    #[test]
    fn builds_xlsx_archive_with_header_and_numeric_cells() {
        let payload = ExcelExportPayload {
            worksheet_name: "Фосфор/выход".to_string(),
            header_rows: vec![
                ExcelHeaderRow {
                    cells: vec!["Дата".to_string(), "Фосфор".to_string()],
                },
                ExcelHeaderRow {
                    cells: vec!["".to_string(), "Вход".to_string()],
                },
            ],
            rows: vec![vec![
                Some(ExcelCellValue::Text("2026-04-13".to_string())),
                Some(ExcelCellValue::Number(1.25)),
            ]],
        };

        let bytes = build_excel_bytes(&payload).expect("xlsx bytes");
        let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("zip archive");

        let mut workbook = String::new();
        archive
            .by_name("xl/workbook.xml")
            .expect("workbook")
            .read_to_string(&mut workbook)
            .expect("read workbook");
        assert!(workbook.contains(r#"sheet name="Фосфор_выход""#));

        let mut sheet = String::new();
        archive
            .by_name("xl/worksheets/sheet1.xml")
            .expect("sheet1")
            .read_to_string(&mut sheet)
            .expect("read sheet");
        assert!(sheet.contains("Фосфор"));
        assert!(sheet.contains("Вход"));
        assert!(sheet.contains("<v>1.25</v>"));
    }

    #[test]
    fn sanitizes_empty_sheet_name() {
        assert_eq!(sanitize_sheet_name("[]"), "Sheet1");
        assert_eq!(sanitize_sheet_name("Параметры"), "Параметры");
    }

    #[test]
    fn converts_column_indexes_to_excel_names() {
        assert_eq!(excel_column_name(0), "A");
        assert_eq!(excel_column_name(25), "Z");
        assert_eq!(excel_column_name(26), "AA");
        assert_eq!(excel_column_name(51), "AZ");
    }
}
