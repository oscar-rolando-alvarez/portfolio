use crate::{config::Config, error::AppError};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres, Row};
use std::time::Duration;
use tracing::{info, warn};

#[derive(Clone)]
pub struct DatabaseService {
    pool: Pool<Postgres>,
}

impl DatabaseService {
    pub async fn new(config: &Config) -> Result<Self, AppError> {
        info!("Connecting to database: {}", config.database.url);

        let pool = PgPoolOptions::new()
            .max_connections(config.database.max_connections)
            .min_connections(config.database.min_connections)
            .acquire_timeout(Duration::from_secs(config.database.acquire_timeout))
            .idle_timeout(Duration::from_secs(config.database.idle_timeout))
            .max_lifetime(Duration::from_secs(config.database.max_lifetime))
            .connect(&config.database.url)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to connect to database: {}", e))
            })?;

        // Test the connection
        let _: (i64,) = sqlx::query_as("SELECT 1")
            .fetch_one(&pool)
            .await
            .map_err(|e| AppError::Database(format!("Database health check failed: {}", e)))?;

        info!("Database connection established successfully");

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &Pool<Postgres> {
        &self.pool
    }

    pub async fn migrate(&self) -> Result<(), AppError> {
        info!("Running database migrations...");
        
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Migration failed: {}", e)))?;

        info!("Database migrations completed successfully");
        Ok(())
    }

    pub async fn health_check(&self) -> Result<DatabaseHealth, AppError> {
        let start = std::time::Instant::now();
        
        // Test basic connectivity
        let result: Result<(i64,), sqlx::Error> = sqlx::query_as("SELECT 1")
            .fetch_one(&self.pool)
            .await;

        let response_time = start.elapsed();
        let is_healthy = result.is_ok();

        if let Err(e) = result {
            warn!("Database health check failed: {}", e);
        }

        // Get pool statistics
        let pool_stats = PoolStats {
            size: self.pool.size(),
            idle: self.pool.num_idle(),
            connections: self.pool.num_idle() + self.pool.size(),
        };

        Ok(DatabaseHealth {
            healthy: is_healthy,
            response_time_ms: response_time.as_millis() as u64,
            pool_stats,
        })
    }

    pub async fn get_stats(&self) -> DatabaseStats {
        DatabaseStats {
            pool_size: self.pool.size(),
            idle_connections: self.pool.num_idle(),
            active_connections: self.pool.size() - self.pool.num_idle(),
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct DatabaseHealth {
    pub healthy: bool,
    pub response_time_ms: u64,
    pub pool_stats: PoolStats,
}

#[derive(Debug, serde::Serialize)]
pub struct PoolStats {
    pub size: u32,
    pub idle: u32,
    pub connections: u32,
}

#[derive(Debug, serde::Serialize)]
pub struct DatabaseStats {
    pub pool_size: u32,
    pub idle_connections: u32,
    pub active_connections: u32,
}