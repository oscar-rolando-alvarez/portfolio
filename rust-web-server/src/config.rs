use serde::{Deserialize, Serialize};

/// Runtime configuration, loaded from defaults, an optional TOML file
/// (`CONFIG_FILE`) and `APP_*` environment variables (nested keys use `__`,
/// e.g. `APP_DATABASE__URL`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub workers: usize,
    pub max_connections: usize,
    pub request_timeout: u64,
    pub shutdown_timeout: u64,
    pub environment: String,
    pub upload_dir: String,
    pub static_dir: String,
    pub cors_allowed_origins: String,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub jwt: JwtConfig,
    pub rate_limit: RateLimitConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: u64,
    pub idle_timeout: u64,
    pub max_lifetime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtConfig {
    pub secret: String,
    pub expiration: i64,
    pub refresh_expiration: i64,
    pub algorithm: String,
    pub issuer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub enabled: bool,
    pub requests_per_minute: u32,
    pub burst_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    /// `json` (default), `pretty` or `compact`.
    pub format: String,
}

/// Placeholder secret used only when nothing is configured; refused in production.
pub const INSECURE_DEFAULT_SECRET: &str = "insecure-development-secret-change-me";

impl Config {
    /// Loads configuration from the process environment (and `.env` if present).
    pub fn from_env() -> Result<Self, config::ConfigError> {
        dotenvy::dotenv().ok();
        let config = Self::builder()?
            .add_source(
                config::Environment::with_prefix("APP")
                    .prefix_separator("_")
                    .separator("__")
                    .try_parsing(true),
            )
            .build()?
            .try_deserialize::<Self>()?;
        config.validate()?;
        Ok(config)
    }

    /// Configuration made only of defaults; handy for tests.
    pub fn defaults() -> Result<Self, config::ConfigError> {
        Self::builder()?.build()?.try_deserialize()
    }

    fn builder() -> Result<config::ConfigBuilder<config::builder::DefaultState>, config::ConfigError>
    {
        let mut builder = config::Config::builder()
            .set_default("host", "0.0.0.0")?
            .set_default("port", 8080)?
            .set_default("workers", num_cpus::get() as u64)?
            .set_default("max_connections", 25_000)?
            .set_default("request_timeout", 30)?
            .set_default("shutdown_timeout", 30)?
            .set_default("environment", "development")?
            .set_default("upload_dir", "./uploads")?
            .set_default("static_dir", "./static")?
            .set_default("cors_allowed_origins", "*")?
            .set_default(
                "database.url",
                "postgres://postgres:postgres@localhost:5432/rust_web_server",
            )?
            .set_default("database.max_connections", 20)?
            .set_default("database.min_connections", 2)?
            .set_default("database.acquire_timeout", 10)?
            .set_default("database.idle_timeout", 600)?
            .set_default("database.max_lifetime", 1800)?
            .set_default("redis.url", "redis://localhost:6379")?
            .set_default("redis.timeout", 5)?
            .set_default("jwt.secret", INSECURE_DEFAULT_SECRET)?
            .set_default("jwt.expiration", 3600)?
            .set_default("jwt.refresh_expiration", 604_800)?
            .set_default("jwt.algorithm", "HS256")?
            .set_default("jwt.issuer", "rust-web-server")?
            .set_default("rate_limit.enabled", true)?
            .set_default("rate_limit.requests_per_minute", 120)?
            .set_default("rate_limit.burst_size", 30)?
            .set_default("logging.level", "info")?
            .set_default("logging.format", "json")?;

        if let Ok(file) = std::env::var("CONFIG_FILE") {
            builder = builder.add_source(config::File::with_name(&file));
        }
        Ok(builder)
    }

    /// Rejects configurations that would be unsafe to run in production.
    pub fn validate(&self) -> Result<(), config::ConfigError> {
        if self.is_production()
            && (self.jwt.secret == INSECURE_DEFAULT_SECRET || self.jwt.secret.len() < 32)
        {
            return Err(config::ConfigError::Message(
                "APP_JWT__SECRET must be set to at least 32 characters in production".into(),
            ));
        }
        if self.rate_limit.requests_per_minute == 0 || self.rate_limit.burst_size == 0 {
            return Err(config::ConfigError::Message(
                "rate limit values must be greater than zero".into(),
            ));
        }
        Ok(())
    }

    pub fn is_production(&self) -> bool {
        self.environment.eq_ignore_ascii_case("production")
    }

    pub fn jwt_algorithm(&self) -> jsonwebtoken::Algorithm {
        match self.jwt.algorithm.as_str() {
            "HS384" => jsonwebtoken::Algorithm::HS384,
            "HS512" => jsonwebtoken::Algorithm::HS512,
            _ => jsonwebtoken::Algorithm::HS256,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        let config = Config::defaults().expect("defaults deserialize");
        assert_eq!(config.port, 8080);
        assert_eq!(config.jwt.algorithm, "HS256");
        assert!(config.validate().is_ok());
    }

    #[test]
    fn production_requires_strong_secret() {
        let mut config = Config::defaults().unwrap();
        config.environment = "production".into();
        assert!(config.validate().is_err());

        config.jwt.secret = "a".repeat(48);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn unknown_algorithm_falls_back_to_hs256() {
        let mut config = Config::defaults().unwrap();
        config.jwt.algorithm = "none".into();
        assert_eq!(config.jwt_algorithm(), jsonwebtoken::Algorithm::HS256);
    }
}
