//! Password hashing (Argon2id) and JWT issuance/validation.

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    config::Config,
    error::AppError,
    models::auth::{Claims, Role},
};

pub const ACCESS_AUDIENCE: &str = "api";
pub const REFRESH_AUDIENCE: &str = "refresh";

pub fn hash_password(password: &str) -> Result<String, AppError> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|e| AppError::Internal(format!("password hashing failed: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("invalid stored password hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// SHA-256 of a token, used so raw refresh tokens are never stored.
pub fn hash_token(token: &str) -> String {
    hex_encode(&Sha256::digest(token.as_bytes()))
}

fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// Builds and signs a token for the given audience.
pub fn issue_token(
    config: &Config,
    user_id: Uuid,
    email: &str,
    roles: &[String],
    audience: &str,
) -> Result<String, AppError> {
    let now = Utc::now().timestamp().max(0) as u64;
    let (ttl, roles, permissions) = if audience == REFRESH_AUDIENCE {
        (config.jwt.refresh_expiration, Vec::new(), Vec::new())
    } else {
        (
            config.jwt.expiration,
            roles.to_vec(),
            Role::permissions_for(roles),
        )
    };

    let claims = Claims {
        sub: user_id,
        email: email.to_string(),
        roles,
        permissions,
        exp: now + ttl.max(1) as u64,
        iat: now,
        nbf: now,
        iss: config.jwt.issuer.clone(),
        aud: audience.to_string(),
        jti: Uuid::new_v4(),
    };

    Ok(encode(
        &Header::new(config.jwt_algorithm()),
        &claims,
        &EncodingKey::from_secret(config.jwt.secret.as_bytes()),
    )?)
}

/// Verifies signature, expiry, issuer and audience of a token.
pub fn decode_token(config: &Config, token: &str, audience: &str) -> Result<Claims, AppError> {
    let mut validation = Validation::new(config.jwt_algorithm());
    validation.validate_nbf = true;
    validation.set_audience(&[audience]);
    validation.set_issuer(&[config.jwt.issuer.as_str()]);

    Ok(decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt.secret.as_bytes()),
        &validation,
    )?
    .claims)
}

/// Redis key used to deny-list a revoked access token until it expires.
pub fn revoked_token_key(jti: &Uuid) -> String {
    format!("auth:revoked:{jti}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::defaults().unwrap()
    }

    #[test]
    fn password_hash_round_trip() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password("correct horse battery staple", &hash).unwrap());
        assert!(!verify_password("wrong", &hash).unwrap());
    }

    #[test]
    fn access_token_round_trip() {
        let config = config();
        let id = Uuid::new_v4();
        let token = issue_token(
            &config,
            id,
            "ada@example.com",
            &["admin".into()],
            ACCESS_AUDIENCE,
        )
        .unwrap();
        let claims = decode_token(&config, &token, ACCESS_AUDIENCE).unwrap();
        assert_eq!(claims.sub, id);
        assert!(claims.has_role(Role::Admin));
        assert!(claims.permissions.contains(&"system:manage".to_string()));
    }

    #[test]
    fn refresh_token_is_rejected_as_access_token() {
        let config = config();
        let token = issue_token(
            &config,
            Uuid::new_v4(),
            "a@b.co",
            &["user".into()],
            REFRESH_AUDIENCE,
        )
        .unwrap();
        assert!(decode_token(&config, &token, ACCESS_AUDIENCE).is_err());
        assert!(decode_token(&config, &token, REFRESH_AUDIENCE).is_ok());
    }

    #[test]
    fn token_signed_with_other_secret_is_rejected() {
        let config = config();
        let mut other = config.clone();
        other.jwt.secret = "another-secret-that-is-long-enough-to-use".into();
        let token = issue_token(&other, Uuid::new_v4(), "a@b.co", &[], ACCESS_AUDIENCE).unwrap();
        assert!(decode_token(&config, &token, ACCESS_AUDIENCE).is_err());
    }

    #[test]
    fn token_hash_is_stable_hex() {
        let hash = hash_token("abc");
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
