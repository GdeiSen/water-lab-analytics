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
    parser::{normalizer::NameNormalizer, parse_file_safe},
    storage::database::{Database, PersistedFile},
};

const PARSER_CACHE_VERSION: &str = "2026-03-11-parser-v5-objects";

pub fn process_archive(
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
    let archive_id = db.get_or_create_archive(&archive_path, files.len())?;
    db.update_last_archive_setting(&archive_path)?;

    let cached_parser_version = db.get_setting("parser_cache_version")?;
    let force_reparse = cached_parser_version.as_deref() != Some(PARSER_CACHE_VERSION);
    if force_reparse {
        db.set_setting("parser_cache_version", PARSER_CACHE_VERSION)?;
    }

    let existing_hashes = db.get_file_hashes(archive_id)?;

    let mut current_filenames = HashSet::new();
    let mut to_parse = Vec::new();
    let mut skipped_files = 0usize;

    for file in &files {
        let relative_name = file
            .strip_prefix(path)
            .unwrap_or(file)
            .to_string_lossy()
            .to_string();
        current_filenames.insert(relative_name.clone());

        let hash = hash_file(file)?;
        match (!force_reparse)
            .then(|| existing_hashes.get(&relative_name))
            .flatten()
        {
            Some(prev_hash) if prev_hash == &hash => {
                skipped_files += 1;
            }
            _ => {
                to_parse.push((file.clone(), relative_name, hash));
            }
        }
    }

    let total_to_parse = to_parse.len();
    let progress = AtomicUsize::new(0);

    let parsed_files = to_parse
        .par_iter()
        .map(|(file_path, relative_name, hash)| {
            let mut parsed = parse_file_safe(file_path, normalizer);
            parsed.filename = relative_name.clone();

            let current = progress.fetch_add(1, Ordering::SeqCst) + 1;
            if let Some(app_handle) = app {
                let _ = app_handle.emit(
                    "parse:progress",
                    ParseProgress {
                        current: current as u32,
                        total: total_to_parse as u32,
                        filename: relative_name.clone(),
                    },
                );
            }

            PersistedFile {
                parsed,
                file_hash: hash.clone(),
            }
        })
        .collect::<Vec<PersistedFile>>();

    if !parsed_files.is_empty() {
        db.upsert_parsed_files(archive_id, &parsed_files)?;
    }
    db.remove_absent_files(archive_id, &current_filenames)?;
    db.cleanup_unused_test_types()?;

    let files_after = db.get_file_list(archive_id)?;
    let tests = db.get_all_test_types()?;

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
        let _ = app_handle.emit("parse:complete", &summary);
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
