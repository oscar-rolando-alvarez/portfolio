use std::str::FromStr;

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

/// JWT claims carried by access and refresh tokens.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Claims {
    /// Subject (user id).
    pub sub: Uuid,
    pub email: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub exp: u64,
    pub iat: u64,
    pub nbf: u64,
    pub iss: String,
    /// `api` for access tokens, `refresh` for refresh tokens.
    pub aud: String,
    /// Unique token id, used for revocation.
    pub jti: Uuid,
}

impl Claims {
    pub fn has_role(&self, role: Role) -> bool {
        self.roles.iter().any(|r| r == role.as_str())
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(
        min = 8,
        max = 128,
        message = "Password must be between 8 and 128 characters"
    ))]
    pub password: String,

    #[validate(length(
        min = 2,
        max = 50,
        message = "First name must be between 2 and 50 characters"
    ))]
    pub first_name: String,

    #[validate(length(
        min = 2,
        max = 50,
        message = "Last name must be between 2 and 50 characters"
    ))]
    pub last_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 1, message = "Current password is required"))]
    pub current_password: String,

    #[validate(length(
        min = 8,
        max = 128,
        message = "New password must be between 8 and 128 characters"
    ))]
    pub new_password: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Role {
    Admin,
    Moderator,
    User,
    Guest,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Moderator => "moderator",
            Self::User => "user",
            Self::Guest => "guest",
        }
    }

    pub fn permissions(self) -> &'static [Permission] {
        use Permission::*;
        match self {
            Self::Admin => &[
                ReadUsers,
                WriteUsers,
                DeleteUsers,
                ReadPosts,
                WritePosts,
                DeletePosts,
                ManageSystem,
            ],
            Self::Moderator => &[ReadUsers, ReadPosts, WritePosts, DeletePosts],
            Self::User => &[ReadPosts, WritePosts],
            Self::Guest => &[ReadPosts],
        }
    }

    /// Flattens the permissions granted by a list of role names (unknown roles are ignored).
    pub fn permissions_for(roles: &[String]) -> Vec<String> {
        let mut permissions: Vec<String> = roles
            .iter()
            .filter_map(|r| r.parse::<Role>().ok())
            .flat_map(|r| r.permissions().iter().map(|p| p.as_str().to_string()))
            .collect();
        permissions.sort();
        permissions.dedup();
        permissions
    }
}

impl FromStr for Role {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "admin" => Ok(Self::Admin),
            "moderator" => Ok(Self::Moderator),
            "user" => Ok(Self::User),
            "guest" => Ok(Self::Guest),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Permission {
    ReadUsers,
    WriteUsers,
    DeleteUsers,
    ReadPosts,
    WritePosts,
    DeletePosts,
    ManageSystem,
}

impl Permission {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadUsers => "users:read",
            Self::WriteUsers => "users:write",
            Self::DeleteUsers => "users:delete",
            Self::ReadPosts => "posts:read",
            Self::WritePosts => "posts:write",
            Self::DeletePosts => "posts:delete",
            Self::ManageSystem => "system:manage",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_round_trip() {
        for role in [Role::Admin, Role::Moderator, Role::User, Role::Guest] {
            assert_eq!(role.as_str().parse::<Role>(), Ok(role));
        }
        assert!("root".parse::<Role>().is_err());
    }

    #[test]
    fn permissions_are_merged_and_deduplicated() {
        let perms = Role::permissions_for(&["user".into(), "moderator".into(), "bogus".into()]);
        assert_eq!(
            perms,
            vec!["posts:delete", "posts:read", "posts:write", "users:read"]
        );
    }

    #[test]
    fn register_request_validation() {
        let bad = RegisterRequest {
            email: "not-an-email".into(),
            password: "short".into(),
            first_name: "A".into(),
            last_name: "Lovelace".into(),
        };
        let errors = bad.validate().unwrap_err();
        let fields = errors.field_errors();
        assert!(fields.contains_key("email"));
        assert!(fields.contains_key("password"));
        assert!(fields.contains_key("first_name"));
        assert!(!fields.contains_key("last_name"));
    }
}
