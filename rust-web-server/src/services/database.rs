use std::time::{Duration, Instant};

use serde::Serialize;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tracing::{info, warn};

use crate::{config::Config, error::AppError};

/// Thin wrapper around a Postgres connection pool.
#[derive(Clone)]
pub struct DatabaseService {
    pool: PgPool,
}

impl DatabaseService {
    pub async fn new(config: &Config) -> Result<Self, AppError> {
        info!("connecting to Postgres");

        let pool = PgPoolOptions::new()
            .max_connections(config.database.max_connections)
            .min_connections(config.database.min_connections)
            .acquire_timeout(Duration::from_secs(config.database.acquire_timeout))
            .idle_timeout(Duration::from_secs(config.database.idle_timeout))
            .max_lifetime(Duration::from_secs(config.database.max_lifetime))
            .connect(&config.database.url)
            .await
            .map_err(|e| AppError::Database(format!("failed to connect to database: {e}")))?;

        Ok(Self { pool })
    }

    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Applies the embedded SQL migrations in `./migrations`.
    pub async fn migrate(&self) -> Result<(), AppError> {
        info!("running database migrations");
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
    }

    pub async fn health_check(&self) -> DatabaseHealth {
        let start = Instant::now();
        let result = sqlx::query_scalar::<_, i32>("SELECT 1")
            .fetch_one(&self.pool)
            .await;
        if let Err(e) = &result {
            warn!(error = %e, "database health check failed");
        }

        DatabaseHealth {
            healthy: result.is_ok(),
            response_time_ms: start.elapsed().as_millis() as u64,
            pool: self.stats(),
        }
    }

    pub fn stats(&self) -> DatabaseStats {
        let size = self.pool.size();
        let idle = self.pool.num_idle() as u32;
        DatabaseStats {
            pool_size: size,
            idle_connections: idle,
            active_connections: size.saturating_sub(idle),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseHealth {
    pub healthy: bool,
    pub response_time_ms: u64,
    pub pool: DatabaseStats,
}

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseStats {
    pub pool_size: u32,
    pub idle_connections: u32,
    pub active_connections: u32,
}
