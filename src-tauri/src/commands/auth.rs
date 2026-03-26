use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use tauri::State;

use crate::{
    errors::AppError,
    models::{AuthToken, UserRole},
    AppState,
};

#[tauri::command]
pub async fn login(
    username: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<AuthToken, AppError> {
    let normalized = username.trim().to_lowercase();
    if normalized.is_empty() {
        return Err(AppError::Auth("Логин не может быть пустым".to_string()));
    }

    let credentials = state
        .db
        .get_user_credentials(&normalized)?
        .ok_or_else(|| AppError::Auth("Неверный логин или пароль".to_string()))?;

    let (_, password_hash, role_raw) = credentials;

    if !verify_password(&password_hash, &password)? {
        return Err(AppError::Auth("Неверный логин или пароль".to_string()));
    }

    let role = UserRole::from_db(&role_raw);
    let token = state.create_session(normalized.clone(), role.clone());

    Ok(AuthToken {
        token,
        username: normalized,
        role,
    })
}

#[tauri::command]
pub async fn logout(session_token: String, state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(state.remove_session(&session_token))
}

#[tauri::command]
pub async fn whoami(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<AuthToken, AppError> {
    let session = state.require_session(&session_token)?;
    Ok(AuthToken {
        token: session_token,
        username: session.username,
        role: session.role,
    })
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| AppError::Generic(format!("Не удалось захэшировать пароль: {error}")))?
        .to_string();
    Ok(hash)
}

pub fn verify_password(password_hash: &str, password: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|error| AppError::Generic(format!("Некорректный hash пароля: {error}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}
