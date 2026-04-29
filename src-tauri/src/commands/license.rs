use std::{fs, path::PathBuf, time::Duration};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::errors::AppError;

const TOKEN_PREFIX: &str = "wla1";
const LICENSE_FILE: &str = "license.json";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const PUBLIC_KEY: Option<&str> = option_env!("WLA_LICENSE_PUBLIC_KEY");
const API_URL: Option<&str> = option_env!("WLA_LICENSE_API_URL");
const LICENSE_REQUIRED: Option<&str> = option_env!("WLA_LICENSE_REQUIRED");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub required: bool,
    pub active: bool,
    pub fingerprint: String,
    pub customer_name: Option<String>,
    pub license_id: Option<String>,
    pub expires_at: Option<String>,
    pub source: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredLicense {
    token: String,
    saved_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseClaims {
    license_id: String,
    customer_name: String,
    fingerprint: String,
    issued_at: String,
    expires_at: Option<String>,
    source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivationRequest {
    license_key: String,
    fingerprint: String,
    device_label: String,
    app_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivationResponse {
    token: Option<String>,
    error: Option<String>,
    message: Option<String>,
    code: Option<String>,
}

#[tauri::command]
pub fn get_license_status(app: AppHandle) -> Result<LicenseStatus, AppError> {
    let fingerprint = machine_fingerprint()?;
    let required = is_license_required();

    if !required {
        return Ok(LicenseStatus {
            required,
            active: true,
            fingerprint,
            customer_name: None,
            license_id: None,
            expires_at: None,
            source: None,
            message: Some("Лицензирование отключено для этой сборки".to_string()),
        });
    }

    match read_stored_token(&app)? {
        Some(token) => status_from_token(&fingerprint, &token, required),
        None => Ok(inactive_status(
            fingerprint,
            required,
            "Приложение не активировано",
        )),
    }
}

#[tauri::command]
pub fn activate_license_online(
    app: AppHandle,
    license_key: String,
) -> Result<LicenseStatus, AppError> {
    let fingerprint = machine_fingerprint()?;
    let endpoint = API_URL
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Validation("URL сервера лицензий не настроен".to_string()))?;

    let request = ActivationRequest {
        license_key: license_key.trim().to_string(),
        fingerprint: fingerprint.clone(),
        device_label: device_label(),
        app_version: APP_VERSION.to_string(),
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| AppError::Generic(format!("Ошибка HTTP клиента: {error}")))?;

    let response = client
        .post(endpoint)
        .json(&request)
        .send()
        .map_err(|error| AppError::Generic(format!("Сервер активации недоступен: {error}")))?;

    let status = response.status();
    let payload = response
        .json::<ActivationResponse>()
        .map_err(|error| AppError::Generic(format!("Неверный ответ сервера активации: {error}")))?;

    if !status.is_success() {
        let message = payload
            .error
            .or(payload.message)
            .or(payload.code)
            .unwrap_or_else(|| "Сервер отклонил активацию".to_string());
        return Err(AppError::Validation(message));
    }

    let token = payload
        .token
        .ok_or_else(|| AppError::Validation("Сервер не вернул token лицензии".to_string()))?;
    let status = status_from_token(&fingerprint, &token, true)?;
    if !status.active {
        return Err(AppError::Validation(
            status
                .message
                .clone()
                .unwrap_or_else(|| "Лицензия не активна".to_string()),
        ));
    }
    save_token(&app, &token)?;
    Ok(status)
}

#[tauri::command]
pub fn activate_license_offline(app: AppHandle, token: String) -> Result<LicenseStatus, AppError> {
    let fingerprint = machine_fingerprint()?;
    let cleaned = token.trim().to_string();
    let status = status_from_token(&fingerprint, &cleaned, true)?;
    if !status.active {
        return Err(AppError::Validation(
            status
                .message
                .clone()
                .unwrap_or_else(|| "Лицензия не активна".to_string()),
        ));
    }
    save_token(&app, &cleaned)?;
    Ok(status)
}

#[tauri::command]
pub fn clear_license(app: AppHandle) -> Result<LicenseStatus, AppError> {
    let path = license_path(&app)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    get_license_status(app)
}

fn is_license_required() -> bool {
    match LICENSE_REQUIRED {
        Some("0") | Some("false") | Some("FALSE") => false,
        Some("1") | Some("true") | Some("TRUE") => true,
        _ => PUBLIC_KEY.is_some_and(|value| !value.trim().is_empty()),
    }
}

fn status_from_token(
    fingerprint: &str,
    token: &str,
    required: bool,
) -> Result<LicenseStatus, AppError> {
    let claims = verify_token(token)?;

    if claims.fingerprint != fingerprint {
        return Ok(inactive_status(
            fingerprint.to_string(),
            required,
            "Лицензия выпущена для другого устройства",
        ));
    }

    if let Some(expires_at) = &claims.expires_at {
        let expires = parse_datetime(expires_at)?;
        if expires < Utc::now() {
            return Ok(inactive_status(
                fingerprint.to_string(),
                required,
                "Срок действия лицензии истёк",
            ));
        }
    }

    Ok(LicenseStatus {
        required,
        active: true,
        fingerprint: fingerprint.to_string(),
        customer_name: Some(claims.customer_name),
        license_id: Some(claims.license_id),
        expires_at: claims.expires_at,
        source: Some(claims.source),
        message: Some("Лицензия активна".to_string()),
    })
}

fn verify_token(token: &str) -> Result<LicenseClaims, AppError> {
    let public_key = PUBLIC_KEY
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Validation("Публичный ключ лицензий не настроен".to_string()))?;

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 || parts[0] != TOKEN_PREFIX {
        return Err(AppError::Validation("Неверный формат лицензии".to_string()));
    }

    let payload_b64 = parts[1];
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| AppError::Validation("Неверная подпись лицензии".to_string()))?;
    let signature_array: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| AppError::Validation("Неверный размер подписи лицензии".to_string()))?;
    let signature = Signature::from_bytes(&signature_array);

    let public_key_bytes = URL_SAFE_NO_PAD
        .decode(public_key.trim())
        .map_err(|_| AppError::Validation("Неверный публичный ключ лицензий".to_string()))?;
    let public_key_array: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| AppError::Validation("Неверный размер публичного ключа".to_string()))?;
    let verifying_key = VerifyingKey::from_bytes(&public_key_array)
        .map_err(|_| AppError::Validation("Публичный ключ лицензий повреждён".to_string()))?;

    verifying_key
        .verify(payload_b64.as_bytes(), &signature)
        .map_err(|_| AppError::Validation("Подпись лицензии не прошла проверку".to_string()))?;

    let payload = URL_SAFE_NO_PAD
        .decode(payload_b64)
        .map_err(|_| AppError::Validation("Неверное тело лицензии".to_string()))?;
    serde_json::from_slice::<LicenseClaims>(&payload).map_err(AppError::from)
}

fn inactive_status(fingerprint: String, required: bool, message: &str) -> LicenseStatus {
    LicenseStatus {
        required,
        active: false,
        fingerprint,
        customer_name: None,
        license_id: None,
        expires_at: None,
        source: None,
        message: Some(message.to_string()),
    }
}

fn save_token(app: &AppHandle, token: &str) -> Result<(), AppError> {
    let path = license_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let stored = StoredLicense {
        token: token.to_string(),
        saved_at: Utc::now().to_rfc3339(),
    };
    fs::write(path, serde_json::to_vec_pretty(&stored)?)?;
    Ok(())
}

fn read_stored_token(app: &AppHandle) -> Result<Option<String>, AppError> {
    let path = license_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read(path)?;
    let stored = serde_json::from_slice::<StoredLicense>(&raw)?;
    Ok(Some(stored.token))
}

fn license_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_data_dir().map_err(|error| {
        AppError::Generic(format!("Не удалось определить папку приложения: {error}"))
    })?;
    Ok(dir.join(LICENSE_FILE))
}

fn parse_datetime(value: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| AppError::Validation("Неверная дата окончания лицензии".to_string()))
}

fn machine_fingerprint() -> Result<String, AppError> {
    let raw = platform_machine_id().unwrap_or_else(|| fallback_machine_id());
    if raw.trim().is_empty() {
        return Err(AppError::Generic(
            "Не удалось получить отпечаток устройства".to_string(),
        ));
    }

    let mut hasher = Sha256::new();
    hasher.update(b"water-lab-analytics-license-v1");
    hasher.update(raw.trim().as_bytes());
    Ok(format!("wla-{:x}", hasher.finalize()))
}

#[cfg(target_os = "macos")]
fn platform_machine_id() -> Option<String> {
    let output = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find_map(|line| line.split_once("IOPlatformUUID"))
        .and_then(|(_, tail)| tail.split('"').nth(2))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(target_os = "windows")]
fn platform_machine_id() -> Option<String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}

#[cfg(target_os = "linux")]
fn platform_machine_id() -> Option<String> {
    fs::read_to_string("/etc/machine-id")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_machine_id() -> Option<String> {
    None
}

fn fallback_machine_id() -> String {
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    format!("{}-{username}", std::env::consts::OS)
}

fn device_label() -> String {
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string());
    format!("{} / {username}", std::env::consts::OS)
}
