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
