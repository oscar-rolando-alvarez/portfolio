use crate::{config::Config, error::AppError};
use redis::{aio::ConnectionManager, AsyncCommands, Client, RedisResult};
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;
use tracing::{info, warn};

#[derive(Clone)]
pub struct CacheService {
    connection: ConnectionManager,
    client: Client,
}

impl CacheService {
    pub async fn new(config: &Config) -> Result<Self, AppError> {
        info!("Connecting to Redis: {}", config.redis.url);

        let client = Client::open(config.redis.url.as_str())
            .map_err(|e| AppError::Cache(format!("Failed to create Redis client: {}", e)))?;

        let connection = ConnectionManager::new(client.clone())
            .await
            .map_err(|e| AppError::Cache(format!("Failed to connect to Redis: {}", e)))?;

        // Test the connection
        let mut conn = connection.clone();
        let _: String = conn
            .ping()
            .await
            .map_err(|e| AppError::Cache(format!("Redis health check failed: {}", e)))?;

        info!("Redis connection established successfully");

        Ok(Self { connection, client })
    }

    // Generic cache operations
    pub async fn get<T>(&self, key: &str) -> Result<Option<T>, AppError>
    where
        T: DeserializeOwned,
    {
        let mut conn = self.connection.clone();
        let value: Option<String> = conn
            .get(key)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to get key '{}': {}", key, e)))?;

        match value {
            Some(json_str) => {
                let deserialized = serde_json::from_str(&json_str)
                    .map_err(|e| AppError::Cache(format!("Failed to deserialize value: {}", e)))?;
                Ok(Some(deserialized))
            }
            None => Ok(None),
        }
    }

    pub async fn set<T>(&self, key: &str, value: &T, ttl: Option<Duration>) -> Result<(), AppError>
    where
        T: Serialize,
    {
        let mut conn = self.connection.clone();
        let json_str = serde_json::to_string(value)
            .map_err(|e| AppError::Cache(format!("Failed to serialize value: {}", e)))?;

        match ttl {
            Some(duration) => {
                conn.set_ex(key, json_str, duration.as_secs())
                    .await
                    .map_err(|e| AppError::Cache(format!("Failed to set key '{}': {}", key, e)))?;
            }
            None => {
                conn.set(key, json_str)
                    .await
                    .map_err(|e| AppError::Cache(format!("Failed to set key '{}': {}", key, e)))?;
            }
        }

        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<bool, AppError> {
        let mut conn = self.connection.clone();
        let result: i32 = conn
            .del(key)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to delete key '{}': {}", key, e)))?;

        Ok(result > 0)
    }

    pub async fn exists(&self, key: &str) -> Result<bool, AppError> {
        let mut conn = self.connection.clone();
        let result: bool = conn
            .exists(key)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to check key '{}': {}", key, e)))?;

        Ok(result)
    }

    pub async fn increment(&self, key: &str, delta: i64) -> Result<i64, AppError> {
        let mut conn = self.connection.clone();
        let result: i64 = conn
            .incr(key, delta)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to increment key '{}': {}", key, e)))?;

        Ok(result)
    }

    pub async fn expire(&self, key: &str, ttl: Duration) -> Result<bool, AppError> {
        let mut conn = self.connection.clone();
        let result: bool = conn
            .expire(key, ttl.as_secs() as usize)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to set TTL for key '{}': {}", key, e)))?;

        Ok(result)
    }

    // Session management
    pub async fn set_session<T>(&self, session_id: &str, data: &T, ttl: Duration) -> Result<(), AppError>
    where
        T: Serialize,
    {
        let key = format!("session:{}", session_id);
        self.set(&key, data, Some(ttl)).await
    }

    pub async fn get_session<T>(&self, session_id: &str) -> Result<Option<T>, AppError>
    where
        T: DeserializeOwned,
    {
        let key = format!("session:{}", session_id);
        self.get(&key).await
    }

    pub async fn delete_session(&self, session_id: &str) -> Result<bool, AppError> {
        let key = format!("session:{}", session_id);
        self.delete(&key).await
    }

    // Rate limiting support
    pub async fn increment_rate_limit(&self, key: &str, window: Duration) -> Result<i64, AppError> {
        let mut conn = self.connection.clone();
        
        // Use a pipeline for atomic operations
        let mut pipe = redis::pipe();
        pipe.incr(&key, 1)
            .expire(&key, window.as_secs() as usize)
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to increment rate limit: {}", e)))?;

        // Get the current count
        let count: i64 = conn
            .get(&key)
            .await
            .map_err(|e| AppError::Cache(format!("Failed to get rate limit count: {}", e)))?;

        Ok(count)
    }

    // Health check
    pub async fn health_check(&self) -> Result<CacheHealth, AppError> {
        let start = std::time::Instant::now();
        let mut conn = self.connection.clone();

        let result: RedisResult<String> = conn.ping().await;
        let response_time = start.elapsed();
        let is_healthy = result.is_ok();

        if let Err(e) = result {
            warn!("Redis health check failed: {}", e);
        }

        // Get Redis info
        let info: RedisResult<String> = conn.info("memory").await;
        let memory_info = info.unwrap_or_default();

        Ok(CacheHealth {
            healthy: is_healthy,
            response_time_ms: response_time.as_millis() as u64,
            memory_info,
        })
    }

    // Cache statistics
    pub async fn get_stats(&self) -> Result<CacheStats, AppError> {
        let mut conn = self.connection.clone();
        
        let info: String = conn
            .info("stats")
            .await
            .map_err(|e| AppError::Cache(format!("Failed to get Redis stats: {}", e)))?;

        // Parse basic stats from Redis INFO output
        let mut stats = CacheStats::default();
        
        for line in info.lines() {
            if let Some((key, value)) = line.split_once(':') {
                match key {
                    "total_connections_received" => {
                        stats.total_connections = value.parse().unwrap_or(0);
                    }
                    "total_commands_processed" => {
                        stats.total_commands = value.parse().unwrap_or(0);
                    }
                    "keyspace_hits" => {
                        stats.keyspace_hits = value.parse().unwrap_or(0);
                    }
                    "keyspace_misses" => {
                        stats.keyspace_misses = value.parse().unwrap_or(0);
                    }
                    _ => {}
                }
            }
        }

        Ok(stats)
    }
}

#[derive(Debug, serde::Serialize)]
pub struct CacheHealth {
    pub healthy: bool,
    pub response_time_ms: u64,
    pub memory_info: String,
}

#[derive(Debug, Default, serde::Serialize)]
pub struct CacheStats {
    pub total_connections: u64,
    pub total_commands: u64,
    pub keyspace_hits: u64,
    pub keyspace_misses: u64,
}