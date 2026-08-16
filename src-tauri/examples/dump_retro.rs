//! Ad-hoc end-to-end check for the retrospective pipeline: parses a folder
//! of retro workbooks into a throwaway database and prints what the UI would
//! show — the file list, each file's own parameter list, and a chart query.
//!
//! Usage: `cargo run --example dump_retro -- <folder-with-retro-xlsx>`

use std::path::PathBuf;

use water_lab_analytics_lib::{
    models::DataQuery,
    parser::normalizer::NameNormalizer,
    storage::{database::Database, retro_cache::process_retro_archive},
};

fn main() {
    let folder = PathBuf::from(std::env::args().nth(1).expect("archive folder argument"));
    let db_path = std::env::temp_dir().join(format!("retro-dump-{}.sqlite", std::process::id()));
    let db = Database::new(&db_path).expect("database");
    let normalizer = NameNormalizer::default();

    let summary = process_retro_archive(&folder, &db, None, &normalizer).expect("scan archive");
    println!(
        "archive #{} — files={} ok={} warn={} err={}",
        summary.archive_id, summary.total_files, summary.ok_files, summary.warning_files, summary.error_files
    );

    for file in db.get_retro_file_list(summary.archive_id).expect("file list") {
        println!(
            "\n=== [{}] {} | {}..{} | {}",
            file.source_label,
            file.filename,
            file.period_from.clone().unwrap_or_default(),
            file.period_to.clone().unwrap_or_default(),
            file.status
        );
        for warning in &file.warnings {
            println!("    ! {warning}");
        }

        // A parser-side merge that puts two spellings of one parameter on
        // the same (test, month) would be swallowed by the UPSERT in
        // `upsert_retro_files` — compare what was parsed against what was
        // actually stored so that loss is visible instead of silent.
        let stored = db.count_retro_points(file.id).expect("stored point count");
        println!("    точек в базе: {stored}");

        let details = db.get_retro_file_details(file.id).expect("details");
        for fact in &details.facts {
            println!("    факт: {} = {:?}", fact.label, fact.value);
        }

        let tests = db.get_retro_test_types_for_file(file.id).expect("file tests");
        println!("    параметры ({}):", tests.len());
        for test in &tests {
            println!("       #{} {}", test.id, test.display_name);
        }

        // What the chart would draw for this file's first parameter.
        if let Some(first) = tests.first() {
            let dataset = db
                .query_retro_chart_data(&DataQuery {
                    session_token: String::new(),
                    archive_id: summary.archive_id,
                    test_ids: vec![first.id],
                    object_keys: Vec::new(),
                    date_from: None,
                    date_to: None,
                })
                .expect("chart data");
            let filled = dataset
                .points
                .iter()
                .flat_map(|point| point.values.iter())
                .filter(|value| value.value.is_some())
                .count();
            println!(
                "    график '{}': объектов={:?}, точек={}, из них с значением={}",
                first.display_name,
                dataset.objects.iter().map(|o| o.object_key.as_str()).collect::<Vec<_>>(),
                dataset.points.len(),
                filled
            );
        }
    }

    let _ = std::fs::remove_file(&db_path);
}
