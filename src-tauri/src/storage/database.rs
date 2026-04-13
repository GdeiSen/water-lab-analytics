use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};

use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use chrono::Utc;
use parking_lot::Mutex;
use rand::rngs::OsRng;
use rusqlite::{params, Connection};

use crate::{
    errors::AppError,
    models::{
        ChartAveragePoint, ChartDataset, ChartObject, ChartPoint, ChartStats, ChartTest,
        ChartTestStats, ChartValuePoint, DataQuery, FileDetails, FileInfo, FileMeasurementRecord,
        ParsedFile, TechnologicalObject, TestType,
    },
    storage::migrations::run_migrations,
};

#[derive(Debug, Clone)]
pub struct PersistedFile {
    pub parsed: ParsedFile,
    pub file_hash: String,
}

#[derive(Clone)]
pub struct Database {
    pub(crate) connection: Arc<Mutex<Connection>>,
    pub path: PathBuf,
}

impl Database {
    pub fn new(path: impl AsRef<Path>) -> Result<Self, AppError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let connection = Connection::open(&path)?;
        connection.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -64000;
            PRAGMA temp_store = MEMORY;
            "#,
        )?;

        run_migrations(&connection)?;

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            path,
        })
    }

    pub fn ensure_default_admin(&self) -> Result<(), AppError> {
        let conn = self.connection.lock();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        if count > 0 {
            return Ok(());
        }

        let salt = SaltString::generate(&mut OsRng);
        let password_hash = Argon2::default()
            .hash_password("admin".as_bytes(), &salt)
            .map_err(|error| AppError::Generic(format!("Ошибка хэширования пароля: {error}")))?
            .to_string();
        let created_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO users(username, password_hash, role, created_at) VALUES(?1, ?2, 'admin', ?3)",
            params!["admin", password_hash, created_at],
        )?;

        Ok(())
    }

    pub fn get_or_create_archive(&self, path: &str, file_count: usize) -> Result<i64, AppError> {
        let now = Utc::now().to_rfc3339();
        let conn = self.connection.lock();
        conn.execute(
            r#"
            INSERT INTO archives(path, last_scan, file_count)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(path) DO UPDATE SET
                last_scan = excluded.last_scan,
                file_count = excluded.file_count
            "#,
            params![path, now, file_count as i64],
        )?;

        let archive_id = conn.query_row(
            "SELECT id FROM archives WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )?;

        Ok(archive_id)
    }

    pub fn get_latest_archive_id(&self) -> Result<Option<i64>, AppError> {
        let conn = self.connection.lock();
        let mut stmt = conn.prepare("SELECT id FROM archives ORDER BY last_scan DESC LIMIT 1")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn get_file_hashes(&self, archive_id: i64) -> Result<HashMap<String, String>, AppError> {
        let conn = self.connection.lock();
        let mut stmt =
            conn.prepare("SELECT filename, file_hash FROM files WHERE archive_id = ?1")?;
        let rows = stmt.query_map(params![archive_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut hash_map = HashMap::new();
        for row in rows {
            let (filename, hash) = row?;
            hash_map.insert(filename, hash);
        }

        Ok(hash_map)
    }

    pub fn remove_absent_files(
        &self,
        archive_id: i64,
        existing_files: &HashSet<String>,
    ) -> Result<(), AppError> {
        let mut conn = self.connection.lock();
        let tx = conn.transaction()?;

        let mut stmt = tx.prepare("SELECT id, filename FROM files WHERE archive_id = ?1")?;
        let rows = stmt.query_map(params![archive_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut delete_ids = Vec::new();
        for row in rows {
            let (id, filename) = row?;
            if !existing_files.contains(&filename) {
                delete_ids.push(id);
            }
        }

        drop(stmt);
        for id in delete_ids {
            tx.execute("DELETE FROM files WHERE id = ?1", params![id])?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn upsert_parsed_files(
        &self,
        archive_id: i64,
        parsed_files: &[PersistedFile],
    ) -> Result<(), AppError> {
        if parsed_files.is_empty() {
            return Ok(());
        }

        let mut conn = self.connection.lock();
        let tx = conn.transaction()?;
        let parsed_at = Utc::now().to_rfc3339();

        for entry in parsed_files {
            let warnings_json = serde_json::to_string(&entry.parsed.warnings)?;
            tx.execute(
                r#"
                INSERT INTO files(archive_id, filename, date, status, warnings, tank_count, file_hash, parsed_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ON CONFLICT(archive_id, filename) DO UPDATE SET
                    date = excluded.date,
                    status = excluded.status,
                    warnings = excluded.warnings,
                    tank_count = excluded.tank_count,
                    file_hash = excluded.file_hash,
                    parsed_at = excluded.parsed_at
                "#,
                params![
                    archive_id,
                    entry.parsed.filename,
                    entry.parsed.date.to_string(),
                    entry.parsed.status.as_db_value(),
                    warnings_json,
                    entry.parsed.object_count as i64,
                    entry.file_hash,
                    parsed_at,
                ],
            )?;

            let file_id = tx.query_row(
                "SELECT id FROM files WHERE archive_id = ?1 AND filename = ?2",
                params![archive_id, entry.parsed.filename],
                |row| row.get::<_, i64>(0),
            )?;

            tx.execute(
                "DELETE FROM measurements WHERE file_id = ?1",
                params![file_id],
            )?;

            for measurement in &entry.parsed.measurements {
                let test_id =
                    upsert_test_type(&tx, &measurement.test_name, &measurement.test_name_raw)?;
                for value in &measurement.values {
                    tx.execute(
                        r#"
                        INSERT INTO measurements(
                            file_id,
                            test_id,
                            tank_number,
                            object_key,
                            object_label,
                            object_order,
                            value,
                            raw_value
                        )
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                        ON CONFLICT(file_id, test_id, tank_number) DO UPDATE SET
                            object_key = excluded.object_key,
                            object_label = excluded.object_label,
                            object_order = excluded.object_order,
                            value = excluded.value,
                            raw_value = excluded.raw_value
                        "#,
                        params![
                            file_id,
                            test_id,
                            value.object_order as i64,
                            value.object_key,
                            value.object_label,
                            value.object_order as i64,
                            value.value,
                            value.raw_value,
                        ],
                    )?;
                }
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_file_list(&self, archive_id: i64) -> Result<Vec<FileInfo>, AppError> {
        let conn = self.connection.lock();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, filename, date, status, warnings, tank_count, parsed_at
            FROM files
            WHERE archive_id = ?1
            ORDER BY date DESC, filename DESC
            "#,
        )?;

        let rows = stmt.query_map(params![archive_id], |row| {
            let warnings_raw: Option<String> = row.get(4)?;
            let warnings = warnings_raw
                .as_deref()
                .and_then(|w| serde_json::from_str::<Vec<String>>(w).ok())
                .unwrap_or_default();

            Ok(FileInfo {
                id: row.get(0)?,
                filename: row.get(1)?,
                date: row.get(2)?,
                status: row.get(3)?,
                warnings,
                object_count: row.get::<_, i64>(5)? as u16,
                parsed_at: row.get(6)?,
            })
        })?;

        let mut files = Vec::new();
        for row in rows {
            files.push(row?);
        }
        Ok(files)
    }

    pub fn get_file_details(&self, file_id: i64) -> Result<FileDetails, AppError> {
        let conn = self.connection.lock();
        let file_row = conn.query_row(
            "SELECT filename, date, status, warnings, tank_count FROM files WHERE id = ?1",
            params![file_id],
            |row| {
                let warnings_raw: Option<String> = row.get(3)?;
                let warnings = warnings_raw
                    .as_deref()
                    .and_then(|w| serde_json::from_str::<Vec<String>>(w).ok())
                    .unwrap_or_default();

                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    warnings,
                    row.get::<_, i64>(4)? as u16,
                ))
            },
        )?;

        let mut objects_stmt = conn.prepare(
            r#"
            SELECT DISTINCT m.object_key, m.object_label, m.object_order
            FROM measurements m
            WHERE m.file_id = ?1
            ORDER BY m.object_order ASC, m.object_label ASC
            "#,
        )?;

        let object_rows = objects_stmt.query_map(params![file_id], |row| {
            Ok(TechnologicalObject {
                key: row.get(0)?,
                label: row.get(1)?,
                order: row.get::<_, i64>(2)? as u16,
            })
        })?;

        let mut objects = Vec::new();
        for row in object_rows {
            objects.push(row?);
        }
        drop(objects_stmt);

        let mut stmt = conn.prepare(
            r#"
            SELECT
                m.test_id,
                tt.display_name,
                m.object_key,
                m.object_label,
                m.object_order,
                m.value,
                m.raw_value
            FROM measurements m
            JOIN test_types tt ON tt.id = m.test_id
            WHERE m.file_id = ?1
            ORDER BY tt.display_name, m.object_order
            "#,
        )?;

        let rows = stmt.query_map(params![file_id], |row| {
            Ok(FileMeasurementRecord {
                test_id: row.get(0)?,
                test_name: row.get(1)?,
                object_key: row.get(2)?,
                object_label: row.get(3)?,
                object_order: row.get::<_, i64>(4)? as u16,
                value: row.get(5)?,
                raw_value: row.get(6)?,
            })
        })?;

        let mut measurements = Vec::new();
        for row in rows {
            measurements.push(row?);
        }

        Ok(FileDetails {
            id: file_id,
            filename: file_row.0,
            date: file_row.1,
            status: file_row.2,
            warnings: file_row.3,
            object_count: file_row.4,
            objects,
            measurements,
        })
    }

    pub fn get_all_test_types(&self) -> Result<Vec<TestType>, AppError> {
        let conn = self.connection.lock();
        let mut stmt = conn.prepare(
            "SELECT id, canonical_name, display_name, unit, aliases FROM test_types ORDER BY display_name",
        )?;

        let rows = stmt.query_map([], |row| {
            let aliases_raw: Option<String> = row.get(4)?;
            let aliases = aliases_raw
                .as_deref()
                .and_then(|v| serde_json::from_str::<Vec<String>>(v).ok())
                .unwrap_or_default();
            Ok(TestType {
                id: row.get(0)?,
                canonical_name: row.get(1)?,
                display_name: row.get(2)?,
                unit: row.get(3)?,
                aliases,
            })
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        Ok(items)
    }

    pub fn cleanup_unused_test_types(&self) -> Result<(), AppError> {
        let conn = self.connection.lock();
        conn.execute(
            r#"
            DELETE FROM test_types
            WHERE id NOT IN (
                SELECT DISTINCT test_id
                FROM measurements
                WHERE test_id IS NOT NULL
            )
            "#,
            [],
        )?;
        Ok(())
    }

    pub fn query_chart_data(&self, query: &DataQuery) -> Result<ChartDataset, AppError> {
        let conn = self.connection.lock();

        let requested_test_ids = dedup_i64(&query.test_ids);
        let requested_object_keys = dedup_strings(&query.object_keys);

        let test_filter = if requested_test_ids.is_empty() {
            None
        } else {
            Some(requested_test_ids.iter().copied().collect::<HashSet<i64>>())
        };
        let object_filter = if requested_object_keys.is_empty() {
            None
        } else {
            Some(
                requested_object_keys
                    .iter()
                    .cloned()
                    .collect::<HashSet<String>>(),
            )
        };

        let mut test_name_map = HashMap::<i64, String>::new();
        if !requested_test_ids.is_empty() {
            let mut test_stmt =
                conn.prepare("SELECT id, display_name FROM test_types WHERE id = ?1 LIMIT 1")?;
            for test_id in &requested_test_ids {
                let mut rows = test_stmt.query(params![test_id])?;
                if let Some(row) = rows.next()? {
                    test_name_map.insert(row.get::<_, i64>(0)?, row.get::<_, String>(1)?);
                }
            }
        }

        let mut stmt = conn.prepare(
            r#"
            SELECT
                f.date,
                m.test_id,
                tt.display_name,
                m.object_key,
                m.object_label,
                m.object_order,
                m.value
            FROM measurements m
            JOIN files f ON f.id = m.file_id
            JOIN test_types tt ON tt.id = m.test_id
            WHERE f.archive_id = ?1
              AND (?2 IS NULL OR f.date >= ?2)
              AND (?3 IS NULL OR f.date <= ?3)
            ORDER BY f.date ASC, m.test_id ASC, m.object_order ASC
            "#,
        )?;

        let rows = stmt.query_map(
            params![query.archive_id, query.date_from, query.date_to],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)? as u16,
                    row.get::<_, Option<f64>>(6)?,
                ))
            },
        )?;

        let mut by_date: BTreeMap<String, HashMap<i64, HashMap<String, Option<f64>>>> =
            BTreeMap::new();
        let mut all_object_meta = HashMap::<String, (String, u16)>::new();
        let mut observed_test_ids = HashSet::<i64>::new();
        let mut stats_by_test = HashMap::<i64, Vec<f64>>::new();

        for row in rows {
            let (date, test_id, test_name, object_key, object_label, object_order, value) = row?;
            if let Some(filter) = &object_filter {
                if !filter.contains(&object_key) {
                    continue;
                }
            }

            all_object_meta
                .entry(object_key.clone())
                .and_modify(|current| {
                    if object_order < current.1 {
                        *current = (object_label.clone(), object_order);
                    }
                })
                .or_insert((object_label.clone(), object_order));

            if let Some(filter) = &test_filter {
                if !filter.contains(&test_id) {
                    continue;
                }
            }

            observed_test_ids.insert(test_id);
            test_name_map.entry(test_id).or_insert(test_name);

            by_date
                .entry(date)
                .or_default()
                .entry(test_id)
                .or_default()
                .insert(object_key, value);

            if let Some(v) = value {
                stats_by_test.entry(test_id).or_default().push(v);
            }
        }

        let tests = if requested_test_ids.is_empty() {
            let mut observed = observed_test_ids.into_iter().collect::<Vec<i64>>();
            observed.sort_by(|left, right| {
                let left_name = test_name_map.get(left).cloned().unwrap_or_default();
                let right_name = test_name_map.get(right).cloned().unwrap_or_default();
                left_name.cmp(&right_name)
            });
            observed
                .into_iter()
                .map(|test_id| ChartTest {
                    test_id,
                    test_name: test_name_map
                        .get(&test_id)
                        .cloned()
                        .unwrap_or_else(|| format!("Параметр {test_id}")),
                })
                .collect::<Vec<_>>()
        } else {
            requested_test_ids
                .into_iter()
                .filter_map(|test_id| {
                    test_name_map
                        .get(&test_id)
                        .cloned()
                        .map(|test_name| ChartTest { test_id, test_name })
                })
                .collect::<Vec<_>>()
        };

        let objects = if requested_object_keys.is_empty() {
            let mut object_rows = all_object_meta
                .iter()
                .map(|(key, (label, order))| ChartObject {
                    object_key: key.clone(),
                    object_label: label.clone(),
                    object_order: *order,
                })
                .collect::<Vec<_>>();
            object_rows.sort_by(|left, right| {
                left.object_order
                    .cmp(&right.object_order)
                    .then(left.object_label.cmp(&right.object_label))
            });
            object_rows
        } else {
            requested_object_keys
                .iter()
                .enumerate()
                .map(|(index, key)| {
                    let (label, order) = all_object_meta
                        .get(key)
                        .cloned()
                        .unwrap_or_else(|| (key.clone(), (index + 1) as u16));
                    ChartObject {
                        object_key: key.clone(),
                        object_label: label,
                        object_order: order,
                    }
                })
                .collect::<Vec<_>>()
        };

        let mut points = Vec::with_capacity(by_date.len());
        for (date, test_map) in by_date {
            let mut values = Vec::with_capacity(tests.len() * objects.len());
            let mut averages = Vec::with_capacity(tests.len());

            for test in &tests {
                let object_values = test_map.get(&test.test_id);
                let mut local_values = Vec::new();

                for object in &objects {
                    let value = object_values
                        .and_then(|map| map.get(&object.object_key))
                        .copied()
                        .flatten();
                    if let Some(v) = value {
                        local_values.push(v);
                    }
                    values.push(ChartValuePoint {
                        test_id: test.test_id,
                        object_key: object.object_key.clone(),
                        value,
                    });
                }

                let average = if local_values.is_empty() {
                    None
                } else {
                    Some(local_values.iter().sum::<f64>() / local_values.len() as f64)
                };
                averages.push(ChartAveragePoint {
                    test_id: test.test_id,
                    value: average,
                });
            }

            points.push(ChartPoint {
                date,
                values,
                averages,
            });
        }

        let stats_by_test = tests
            .iter()
            .map(|test| ChartTestStats {
                test_id: test.test_id,
                test_name: test.test_name.clone(),
                stats: calculate_stats(stats_by_test.remove(&test.test_id).unwrap_or_default()),
            })
            .collect::<Vec<_>>();

        Ok(ChartDataset {
            tests,
            objects,
            points,
            stats_by_test,
        })
    }

    pub fn get_user_credentials(
        &self,
        username: &str,
    ) -> Result<Option<(i64, String, String)>, AppError> {
        let conn = self.connection.lock();
        let mut stmt =
            conn.prepare("SELECT id, password_hash, role FROM users WHERE username = ?1")?;
        let mut rows = stmt.query(params![username])?;
        if let Some(row) = rows.next()? {
            Ok(Some((row.get(0)?, row.get(1)?, row.get(2)?)))
        } else {
            Ok(None)
        }
    }

    pub fn update_last_archive_setting(&self, path: &str) -> Result<(), AppError> {
        self.set_setting("last_archive_path", path)
    }

    pub fn get_last_archive_setting(&self) -> Result<Option<String>, AppError> {
        self.get_setting("last_archive_path")
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.connection.lock();
        conn.execute(
            r#"
            INSERT INTO settings(key, value)
            VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            "#,
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = self.connection.lock();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn archive_path_by_id(&self, archive_id: i64) -> Result<Option<String>, AppError> {
        let conn = self.connection.lock();
        let mut stmt = conn.prepare("SELECT path FROM archives WHERE id = ?1")?;
        let mut rows = stmt.query(params![archive_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }
}

fn upsert_test_type(
    tx: &rusqlite::Transaction<'_>,
    canonical: &str,
    raw_display: &str,
) -> Result<i64, AppError> {
    let mut stmt = tx.prepare("SELECT id, aliases FROM test_types WHERE canonical_name = ?1")?;
    let mut rows = stmt.query(params![canonical])?;

    if let Some(row) = rows.next()? {
        let test_id: i64 = row.get(0)?;
        let aliases_raw: Option<String> = row.get(1)?;
        let mut aliases = aliases_raw
            .as_deref()
            .and_then(|value| serde_json::from_str::<Vec<String>>(value).ok())
            .unwrap_or_default();

        if !aliases
            .iter()
            .any(|alias| alias.eq_ignore_ascii_case(raw_display))
        {
            aliases.push(raw_display.to_string());
            tx.execute(
                "UPDATE test_types SET aliases = ?1 WHERE id = ?2",
                params![serde_json::to_string(&aliases)?, test_id],
            )?;
        }

        return Ok(test_id);
    }

    drop(rows);
    drop(stmt);

    tx.execute(
        "INSERT INTO test_types(canonical_name, display_name, aliases) VALUES (?1, ?2, ?3)",
        params![
            canonical,
            raw_display,
            serde_json::to_string(&vec![raw_display])?
        ],
    )?;

    Ok(tx.last_insert_rowid())
}

fn dedup_i64(values: &[i64]) -> Vec<i64> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        if seen.insert(*value) {
            result.push(*value);
        }
    }
    result
}

fn dedup_strings(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = trimmed.to_string();
        if seen.insert(normalized.clone()) {
            result.push(normalized);
        }
    }
    result
}

fn calculate_stats(mut values: Vec<f64>) -> ChartStats {
    if values.is_empty() {
        return ChartStats::default();
    }

    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let len = values.len();
    let min = values.first().copied();
    let max = values.last().copied();
    let sum = values.iter().sum::<f64>();
    let average = Some(sum / len as f64);

    let median = if len % 2 == 0 {
        Some((values[len / 2 - 1] + values[len / 2]) / 2.0)
    } else {
        Some(values[len / 2])
    };

    let mean = average.unwrap_or(0.0);
    let variance = values
        .iter()
        .map(|v| {
            let diff = *v - mean;
            diff * diff
        })
        .sum::<f64>()
        / len as f64;

    ChartStats {
        min,
        max,
        average,
        median,
        std_dev: Some(variance.sqrt()),
        points_with_values: len,
    }
}
