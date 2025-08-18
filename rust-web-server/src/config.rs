use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub workers: usize,
    pub max_connections: usize,
    pub request_timeout: u64,
    pub shutdown_timeout: u64,
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
    pub max_connections: usize,
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtConfig {
    pub secret: String,
    pub expiration: i64,
    pub refresh_expiration: i64,
    pub algorithm: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub requests_per_minute: u32,
    pub burst_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String, // "json" or "pretty"
}

impl Config {
    pub fn from_env() -> Result<Self, config::ConfigError> {
        dotenvy::dotenv().ok();

        let mut cfg = config::Config::builder()
            .set_default("host", "0.0.0.0")?
            .set_default("port", 8080)?
            .set_default("workers", num_cpus::get())?
            .set_default("max_connections", 25000)?
            .set_default("request_timeout", 30)?
            .set_default("shutdown_timeout", 60)?
            // Database defaults
            .set_default("database.url", "postgresql://localhost/rust_web_server")?
            .set_default("database.max_connections", 20)?
            .set_default("database.min_connections", 5)?
            .set_default("database.acquire_timeout", 30)?
            .set_default("database.idle_timeout", 600)?
            .set_default("database.max_lifetime", 1800)?
            // Redis defaults
            .set_default("redis.url", "redis://localhost:6379")?
            .set_default("redis.max_connections", 10)?
            .set_default("redis.timeout", 5)?
            // JWT defaults
            .set_default("jwt.secret", "your-secret-key-change-this")?
            .set_default("jwt.expiration", 3600)?       // 1 hour
            .set_default("jwt.refresh_expiration", 604800)? // 1 week
            .set_default("jwt.algorithm", "HS256")?
            // Rate limiting defaults
            .set_default("rate_limit.requests_per_minute", 60)?
            .set_default("rate_limit.burst_size", 10)?
            // Logging defaults
            .set_default("logging.level", "info")?
            .set_default("logging.format", "json")?;

        // Override with environment variables
        cfg = cfg.add_source(config::Environment::with_prefix("APP"));

        // Override with command line arguments if needed
        if let Ok(config_file) = env::var("CONFIG_FILE") {
            cfg = cfg.add_source(config::File::with_name(&config_file));
        }

        cfg.build()?.try_deserialize()
    }

    pub fn database_url(&self) -> &str {
        &self.database.url
    }

    pub fn redis_url(&self) -> &str {
        &self.redis.url
    }

    pub fn is_production(&self) -> bool {
        env::var("ENVIRONMENT").unwrap_or_default() == "production"
    }

    pub fn log_level(&self) -> tracing::Level {
        match self.logging.level.to_lowercase().as_str() {
            "trace" => tracing::Level::TRACE,
            "debug" => tracing::Level::DEBUG,
            "info" => tracing::Level::INFO,
            "warn" => tracing::Level::WARN,
            "error" => tracing::Level::ERROR,
            _ => tracing::Level::INFO,
        }
    }
}