use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Ошибка парсинга файла: {0}")]
    Parse(#[from] ParseError),

    #[error("Ошибка базы данных: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Ошибка JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Ошибка файловой системы: {0}")]
    Io(#[from] std::io::Error),

    #[error("Ошибка уведомлений файловой системы: {0}")]
    Notify(#[from] notify::Error),

    #[error("Ошибка авторизации: {0}")]
    Auth(String),

    #[error("Ошибка валидации: {0}")]
    Validation(String),

    #[error("Ошибка приложения: {0}")]
    Generic(String),
}

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("Невалидное имя файла: не удалось извлечь дату")]
    InvalidFilename,

    #[error("Не обнаружены технологические объекты в заголовке")]
    NoObjectsDetected,

    #[error("Пустой файл или нет данных на листе")]
    EmptySheet,

    #[error("В Excel-файле отсутствуют листы")]
    NoSheet,

    #[error("Ошибка чтения Excel: {0}")]
    CalamineError(#[from] calamine::Error),

    #[error("Не удалось прочитать строку с данными")]
    InvalidRow,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
