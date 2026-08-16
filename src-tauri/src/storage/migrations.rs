use rusqlite::Connection;

use crate::errors::AppError;

const MIGRATION_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS archives (
    id          INTEGER PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    last_scan   TEXT NOT NULL,
    file_count  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY,
    archive_id  INTEGER REFERENCES archives(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    date        TEXT NOT NULL,
    status      TEXT NOT NULL,
    warnings    TEXT,
    tank_count  INTEGER NOT NULL,
    file_hash   TEXT NOT NULL,
    parsed_at   TEXT NOT NULL,
    UNIQUE(archive_id, filename)
);

CREATE TABLE IF NOT EXISTS test_types (
    id              INTEGER PRIMARY KEY,
    canonical_name  TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    unit            TEXT,
    aliases         TEXT
);

CREATE TABLE IF NOT EXISTS measurements (
    id          INTEGER PRIMARY KEY,
    file_id     INTEGER REFERENCES files(id) ON DELETE CASCADE,
    test_id     INTEGER REFERENCES test_types(id),
    tank_number INTEGER NOT NULL,
    object_key  TEXT NOT NULL,
    object_label TEXT NOT NULL,
    object_order INTEGER NOT NULL,
    object_active INTEGER NOT NULL DEFAULT 1,
    value       REAL,
    raw_value   TEXT NOT NULL,
    UNIQUE(file_id, test_id, tank_number),
    UNIQUE(file_id, test_id, object_key)
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'viewer',
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_date ON files(date);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_measurements_test ON measurements(test_id);
CREATE INDEX IF NOT EXISTS idx_measurements_tank ON measurements(tank_number);
CREATE INDEX IF NOT EXISTS idx_measurements_file_test ON measurements(file_id, test_id);

-- Retrospective ("retro") mode: kept as its own set of tables rather than
-- reused daily-mode ones, since retro files have no per-file calendar date
-- in their filename (files.date/UNIQUE(archive_id, filename) both assume
-- one row per calendar day) and one physical .xlsx routinely expands into
-- one logical dataset per sheet plus dozens of (year, month) data points.
CREATE TABLE IF NOT EXISTS retro_archives (
    id          INTEGER PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    last_scan   TEXT NOT NULL,
    file_count  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS retro_files (
    id           INTEGER PRIMARY KEY,
    archive_id   INTEGER REFERENCES retro_archives(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL,
    warnings     TEXT,
    file_hash    TEXT NOT NULL,
    parsed_at    TEXT NOT NULL,
    period_from  TEXT,
    period_to    TEXT,
    UNIQUE(archive_id, filename)
);

CREATE TABLE IF NOT EXISTS retro_points (
    id            INTEGER PRIMARY KEY,
    file_id       INTEGER REFERENCES retro_files(id) ON DELETE CASCADE,
    test_id       INTEGER REFERENCES test_types(id),
    object_key    TEXT NOT NULL,
    object_label  TEXT NOT NULL,
    object_order  INTEGER NOT NULL,
    period_date   TEXT NOT NULL,
    value         REAL,
    raw_value     TEXT NOT NULL,
    UNIQUE(file_id, test_id, object_key, period_date)
);

CREATE TABLE IF NOT EXISTS retro_facts (
    id           INTEGER PRIMARY KEY,
    file_id      INTEGER REFERENCES retro_files(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    value        REAL,
    raw_value    TEXT NOT NULL,
    order_index  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retro_points_test ON retro_points(test_id);
CREATE INDEX IF NOT EXISTS idx_retro_points_date ON retro_points(period_date);
CREATE INDEX IF NOT EXISTS idx_retro_points_file ON retro_points(file_id);
CREATE INDEX IF NOT EXISTS idx_retro_facts_file ON retro_facts(file_id);

-- Document container (part 5): imported reference files (methodologies,
-- report forms, standards) organized into user-editable categories.
CREATE TABLE IF NOT EXISTS document_categories (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    order_index  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id            INTEGER PRIMARY KEY,
    category_id   INTEGER REFERENCES document_categories(id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    stored_name   TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    extension     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    notes         TEXT,
    added_at      TEXT NOT NULL,
    order_index   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
"#;

pub fn run_migrations(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch(MIGRATION_SQL)?;

    ensure_column(
        connection,
        "measurements",
        "object_key",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        connection,
        "measurements",
        "object_label",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        connection,
        "measurements",
        "object_order",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        connection,
        "measurements",
        "object_active",
        "INTEGER NOT NULL DEFAULT 1",
    )?;

    connection.execute_batch(
        r#"
        UPDATE measurements
        SET object_key = CAST(tank_number AS TEXT)
        WHERE object_key IS NULL OR TRIM(object_key) = '';

        UPDATE measurements
        SET object_label = CAST(tank_number AS TEXT)
        WHERE object_label IS NULL OR TRIM(object_label) = '';

        UPDATE measurements
        SET object_order = tank_number
        WHERE object_order IS NULL OR object_order = 0;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_measurements_file_test_object
        ON measurements(file_id, test_id, object_key);

        CREATE INDEX IF NOT EXISTS idx_measurements_object_key
        ON measurements(object_key);
        "#,
    )?;

    ensure_column(
        connection,
        "retro_files",
        "source_label",
        "TEXT NOT NULL DEFAULT ''",
    )?;

    seed_default_document_categories(connection)?;

    Ok(())
}

fn seed_default_document_categories(connection: &Connection) -> Result<(), AppError> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM document_categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    const DEFAULTS: [&str; 4] = ["Методики", "Отчётные формы", "Нормативы", "Прочее"];
    for (index, name) in DEFAULTS.iter().enumerate() {
        connection.execute(
            "INSERT OR IGNORE INTO document_categories(name, order_index) VALUES (?1, ?2)",
            (name, (index + 1) as i64),
        )?;
    }

    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), AppError> {
    if has_column(connection, table, column)? {
        return Ok(());
    }

    let statement = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    connection.execute_batch(&statement)?;
    Ok(())
}

fn has_column(connection: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let current: String = row.get(1)?;
        if current == column {
            return Ok(true);
        }
    }

    Ok(false)
}
