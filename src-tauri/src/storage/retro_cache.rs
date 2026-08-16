use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
    time::Instant,
};

use rayon::prelude::*;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::{
    errors::AppError,
    models::{ArchiveSummary, ParseProgress},
    parser::{normalizer::NameNormalizer, retro_reader::parse_retro_workbook_safe},
    storage::database::{Database, PersistedRetroFile},
};

const RETRO_PARSER_CACHE_VERSION: &str = "2026-08-retro-parser-v2";

/// Mirrors `storage::cache::process_archive` for retro archives. The main
/// structural difference: one physical file expands into several logical
/// datasets (one `retro_files` row per sheet), so the unchanged-file skip
/// check and the stale-row purge both key off the physical file's relative
/// path rather than a 1:1 filename.
pub fn process_retro_archive(
    path: &Path,
    db: &Database,
    app: Option<&AppHandle>,
    normalizer: &NameNormalizer,
) -> Result<ArchiveSummary, AppError> {
    let started = Instant::now();

    let mut files = Vec::new();
    collect_excel_files(path, &mut files)?;
    files.sort();

    let archive_path = path.to_string_lossy().to_string();
    let archive_id = db.get_or_create_retro_archive(&archive_path, files.len())?;
    db.set_setting("last_retro_archive", &archive_path)?;

    let cached_parser_version = db.get_setting("retro_parser_cache_version")?;
    let force_reparse = cached_parser_version.as_deref() != Some(RETRO_PARSER_CACHE_VERSION);
    if force_reparse {
        db.set_setting("retro_parser_cache_version", RETRO_PARSER_CACHE_VERSION)?;
    }

    // Keyed by sheet-level filename ("<file>::<sheet>"); every sheet of a
    // given physical file shares that file's hash.
    let existing_hashes = db.get_retro_file_hashes(archive_id)?;

    let mut existing_relative_names = HashSet::new();
    let mut to_parse = Vec::new();
    let mut skipped_files = 0usize;

    for file in &files {
        let relative_name = file
            .strip_prefix(path)
            .unwrap_or(file)
            .to_string_lossy()
            .to_string();
        existing_relative_names.insert(relative_name.clone());

        let hash = hash_file(file)?;
        let unchanged = !force_reparse
            && existing_hashes.iter().any(|(sheet_filename, existing_hash)| {
                sheet_filename.starts_with(&format!("{relative_name}::")) && existing_hash == &hash
            });

        if unchanged {
            skipped_files += 1;
        } else {
            to_parse.push((file.clone(), relative_name, hash));
        }
    }

    let total_to_parse = to_parse.len();
    let progress = AtomicUsize::new(0);

    let parsed_sheets: Vec<PersistedRetroFile> = to_parse
        .par_iter()
        .flat_map(|(file_path, relative_name, hash)| {
            let sheets = parse_retro_workbook_safe(file_path, normalizer);

            let current = progress.fetch_add(1, Ordering::SeqCst) + 1;
            if let Some(app_handle) = app {
                let _ = app_handle.emit(
                    "retro:progress",
                    ParseProgress {
                        current: current as u32,
                        total: total_to_parse as u32,
                        filename: relative_name.clone(),
                    },
                );
            }

            sheets
                .into_iter()
                .map(|parsed| PersistedRetroFile {
                    parsed,
                    file_hash: hash.clone(),
                })
                .collect::<Vec<_>>()
        })
        .collect();

    if !parsed_sheets.is_empty() {
        db.upsert_retro_files(archive_id, &parsed_sheets)?;
    }

    // Sheets belonging to unchanged files stay current as-is; sheets
    // belonging to reparsed/removed files are replaced by whatever the
    // fresh parse actually produced (correctly drops a renamed/removed
    // sheet, or all sheets of a file deleted from disk).
    let reparsed_relative_names: HashSet<String> =
        to_parse.iter().map(|(_, relative, _)| relative.clone()).collect();

    let mut current_filenames: HashSet<String> = existing_hashes
        .keys()
        .filter(|sheet_filename| {
            let relative = sheet_filename.split("::").next().unwrap_or(sheet_filename);
            existing_relative_names.contains(relative) && !reparsed_relative_names.contains(relative)
        })
        .cloned()
        .collect();
    for sheet in &parsed_sheets {
        current_filenames.insert(sheet.parsed.filename.clone());
    }

    db.remove_absent_retro_files(archive_id, &current_filenames)?;
    db.cleanup_unused_test_types()?;

    let files_after = db.get_retro_file_list(archive_id)?;
    let tests = db.get_retro_test_types_for_archive(archive_id)?;

    let mut status_count: HashMap<&'static str, usize> = HashMap::new();
    for file in &files_after {
        let key = match file.status.as_str() {
            "ok" => "ok",
            "warning" => "warning",
            _ => "error",
        };
        *status_count.entry(key).or_insert(0) += 1;
    }

    let summary = ArchiveSummary {
        archive_id,
        archive_path,
        total_files: files_after.len(),
        processed_files: total_to_parse,
        skipped_files,
        ok_files: *status_count.get("ok").unwrap_or(&0),
        warning_files: *status_count.get("warning").unwrap_or(&0),
        error_files: *status_count.get("error").unwrap_or(&0),
        test_names: tests.into_iter().map(|t| t.display_name).collect(),
        duration_ms: started.elapsed().as_millis(),
    };

    if let Some(app_handle) = app {
        let _ = app_handle.emit("retro:complete", &summary);
    }

    Ok(summary)
}

fn collect_excel_files(path: &Path, result: &mut Vec<PathBuf>) -> Result<(), AppError> {
    if !path.exists() {
        return Err(AppError::Validation(format!(
            "Директория архива не найдена: {}",
            path.display()
        )));
    }

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_excel_files(&entry_path, result)?;
            continue;
        }

        if let Some(ext) = entry_path.extension().and_then(|v| v.to_str()) {
            let ext = ext.to_ascii_lowercase();
            if ext == "xlsx" || ext == "xls" {
                result.push(entry_path);
            }
        }
    }

    Ok(())
}

fn hash_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}
