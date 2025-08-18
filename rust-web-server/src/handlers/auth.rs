use crate::{
    error::AppError,
    models::{
        auth::*,
        user::{User, UserResponse},
    },
    AppState,
};
use actix_web::{web, HttpRequest, HttpResponse, Result};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use sqlx::Row;
use std::collections::HashMap;
use uuid::Uuid;
use validator::Validate;

/// Register a new user
pub async fn register(
    body: web::Json<RegisterRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;

    // Check if user already exists
    let existing_user = sqlx::query("SELECT id FROM users WHERE email = $1")
        .bind(&body.email)
        .fetch_optional(data.db.pool())
        .await?;

    if existing_user.is_some() {
        return Err(AppError::BadRequest("User already exists".to_string()));
    }

    // Hash password
    let password_hash = hash_password(&body.password)?;

    // Create user
    let user_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO users (id, email, password_hash, first_name, last_name, roles, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(user_id)
    .bind(&body.email)
    .bind(&password_hash)
    .bind(&body.first_name)
    .bind(&body.last_name)
    .bind(&vec!["user".to_string()])
    .bind(now)
    .bind(now)
    .execute(data.db.pool())
    .await?;

    // Generate tokens
    let (access_token, refresh_token) = generate_tokens(
        user_id,
        &body.email,
        &vec!["user".to_string()],
        &data.config.jwt,
    )?;

    // Store refresh token
    store_refresh_token(user_id, &refresh_token, &data).await?;

    // Update metrics
    data.metrics.increment_user_registrations();

    let response = AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: data.config.jwt.expiration,
        user: UserInfo {
            id: user_id,
            email: body.email.clone(),
            first_name: body.first_name.clone(),
            last_name: body.last_name.clone(),
            roles: vec!["user".to_string()],
            permissions: Role::User.permissions().iter().map(|p| p.as_str().to_string()).collect(),
            created_at: now,
            updated_at: now,
        },
    };

    Ok(HttpResponse::Created().json(response))
}

/// Login user
pub async fn login(
    body: web::Json<LoginRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;

    // Find user
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1 AND is_active = true"
    )
    .bind(&body.email)
    .fetch_optional(data.db.pool())
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid credentials".to_string()))?;

    // Verify password
    if !verify_password(&body.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("Invalid credentials".to_string()));
    }

    // Update last login
    sqlx::query("UPDATE users SET last_login = $1 WHERE id = $2")
        .bind(Utc::now())
        .bind(user.id)
        .execute(data.db.pool())
        .await?;

    // Generate tokens
    let permissions: Vec<String> = user.roles
        .iter()
        .flat_map(|role| {
            if let Some(r) = Role::from_str(role) {
                r.permissions().iter().map(|p| p.as_str().to_string()).collect()
            } else {
                vec![]
            }
        })
        .collect();

    let (access_token, refresh_token) = generate_tokens(
        user.id,
        &user.email,
        &user.roles,
        &data.config.jwt,
    )?;

    // Store refresh token
    store_refresh_token(user.id, &refresh_token, &data).await?;

    // Update metrics
    data.metrics.increment_user_logins();

    let response = AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: data.config.jwt.expiration,
        user: UserInfo {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            roles: user.roles,
            permissions,
            created_at: user.created_at,
            updated_at: user.updated_at,
        },
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Refresh access token
pub async fn refresh_token(
    body: web::Json<RefreshTokenRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    // Verify refresh token
    let token_hash = hash_token(&body.refresh_token);
    
    let refresh_token_record = sqlx::query(
        r#"
        SELECT user_id, expires_at FROM refresh_tokens 
        WHERE token_hash = $1 AND is_revoked = false
        "#
    )
    .bind(&token_hash)
    .fetch_optional(data.db.pool())
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid refresh token".to_string()))?;

    let user_id: Uuid = refresh_token_record.get("user_id");
    let expires_at: chrono::DateTime<Utc> = refresh_token_record.get("expires_at");

    if Utc::now() > expires_at {
        return Err(AppError::Unauthorized("Refresh token expired".to_string()));
    }

    // Get user
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE id = $1 AND is_active = true"
    )
    .bind(user_id)
    .fetch_optional(data.db.pool())
    .await?
    .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;

    // Generate new access token
    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        roles: user.roles.clone(),
        permissions: user.roles
            .iter()
            .flat_map(|role| {
                if let Some(r) = Role::from_str(role) {
                    r.permissions().iter().map(|p| p.as_str().to_string()).collect()
                } else {
                    vec![]
                }
            })
            .collect(),
        exp: (Utc::now() + Duration::seconds(data.config.jwt.expiration)).timestamp() as usize,
        iat: Utc::now().timestamp() as usize,
        nbf: Utc::now().timestamp() as usize,
        iss: "rust-web-server".to_string(),
        aud: "api".to_string(),
    };

    let access_token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(data.config.jwt.secret.as_bytes()),
    )?;

    let response = RefreshTokenResponse {
        access_token,
        token_type: "Bearer".to_string(),
        expires_in: data.config.jwt.expiration,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Logout user
pub async fn logout(
    req: HttpRequest,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    if let Some(claims) = req.extensions().get::<Claims>() {
        // Revoke all refresh tokens for this user
        sqlx::query("UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1")
            .bind(claims.sub)
            .execute(data.db.pool())
            .await?;

        // In a real application, you might also want to blacklist the current JWT token
        // This would require storing it in Redis with its expiration time
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Logged out successfully"
    })))
}

/// Change password
pub async fn change_password(
    req: HttpRequest,
    body: web::Json<ChangePasswordRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;

    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("User not authenticated".to_string()))?;

    // Get current user
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_optional(data.db.pool())
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Verify current password
    if !verify_password(&body.current_password, &user.password_hash)? {
        return Err(AppError::BadRequest("Current password is incorrect".to_string()));
    }

    // Hash new password
    let new_password_hash = hash_password(&body.new_password)?;

    // Update password
    sqlx::query("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3")
        .bind(&new_password_hash)
        .bind(Utc::now())
        .bind(claims.sub)
        .execute(data.db.pool())
        .await?;

    // Revoke all refresh tokens to force re-login
    sqlx::query("UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1")
        .bind(claims.sub)
        .execute(data.db.pool())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Password changed successfully"
    })))
}

/// Get current user profile
pub async fn profile(
    req: HttpRequest,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("User not authenticated".to_string()))?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_optional(data.db.pool())
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(HttpResponse::Ok().json(UserResponse::from(user)))
}

// Helper functions

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = uuid::Uuid::new_v4().to_string();
    let argon2 = Argon2::default();
    
    argon2
        .hash_password(password.as_bytes(), &salt.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|e| AppError::Internal(format!("Password hashing failed: {}", e)))
}

fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("Invalid password hash: {}", e)))?;
    
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

fn generate_tokens(
    user_id: Uuid,
    email: &str,
    roles: &[String],
    jwt_config: &crate::config::JwtConfig,
) -> Result<(String, String), AppError> {
    let now = Utc::now();
    
    let permissions: Vec<String> = roles
        .iter()
        .flat_map(|role| {
            if let Some(r) = Role::from_str(role) {
                r.permissions().iter().map(|p| p.as_str().to_string()).collect()
            } else {
                vec![]
            }
        })
        .collect();

    // Access token claims
    let access_claims = Claims {
        sub: user_id,
        email: email.to_string(),
        roles: roles.to_vec(),
        permissions,
        exp: (now + Duration::seconds(jwt_config.expiration)).timestamp() as usize,
        iat: now.timestamp() as usize,
        nbf: now.timestamp() as usize,
        iss: "rust-web-server".to_string(),
        aud: "api".to_string(),
    };

    // Refresh token claims (longer expiration, minimal data)
    let refresh_claims = Claims {
        sub: user_id,
        email: email.to_string(),
        roles: vec![],
        permissions: vec![],
        exp: (now + Duration::seconds(jwt_config.refresh_expiration)).timestamp() as usize,
        iat: now.timestamp() as usize,
        nbf: now.timestamp() as usize,
        iss: "rust-web-server".to_string(),
        aud: "refresh".to_string(),
    };

    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(jwt_config.secret.as_bytes()),
    )?;

    let refresh_token = encode(
        &Header::default(),
        &refresh_claims,
        &EncodingKey::from_secret(jwt_config.secret.as_bytes()),
    )?;

    Ok((access_token, refresh_token))
}

async fn store_refresh_token(
    user_id: Uuid,
    refresh_token: &str,
    data: &web::Data<AppState>,
) -> Result<(), AppError> {
    let token_hash = hash_token(refresh_token);
    let expires_at = Utc::now() + Duration::seconds(data.config.jwt.refresh_expiration);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(token_hash)
    .bind(expires_at)
    .bind(Utc::now())
    .execute(data.db.pool())
    .await?;

    Ok(())
}

fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}