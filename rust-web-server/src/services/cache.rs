use std::time::{Duration, Instant};

use redis::{AsyncCommands, Client, aio::ConnectionManager};
use serde::{Serialize, de::DeserializeOwned};
use tracing::{info, warn};

use crate::{config::Config, error::AppError};

/// Redis-backed cache used for JSON values and the access-token denylist.
#[derive(Clone)]
pub struct CacheService {
    connection: ConnectionManager,
}

impl CacheService {
    pub async fn new(config: &Config) -> Result<Self, AppError> {
        info!("connecting to Redis");
        let client = Client::open(config.redis.url.as_str())?;
        let connection = tokio::time::timeout(
            Duration::from_secs(config.redis.timeout),
            ConnectionManager::new(client),
        )
        .await
        .map_err(|_| AppError::Cache("timed out connecting to Redis".into()))??;
        Ok(Self { connection })
    }

    fn conn(&self) -> ConnectionManager {
        self.connection.clone()
    }

    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, AppError> {
        let value: Option<String> = self.conn().get(key).await?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(AppError::from))
            .transpose()
    }

    pub async fn set<T: Serialize>(
        &self,
        key: &str,
        value: &T,
        ttl: Option<Duration>,
    ) -> Result<(), AppError> {
        let raw = serde_json::to_string(value)?;
        let mut conn = self.conn();
        match ttl {
            Some(ttl) => {
                conn.set_ex::<_, _, ()>(key, raw, ttl.as_secs().max(1))
                    .await?
            }
            None => conn.set::<_, _, ()>(key, raw).await?,
        }
        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<bool, AppError> {
        let removed: i64 = self.conn().del(key).await?;
        Ok(removed > 0)
    }

    pub async fn exists(&self, key: &str) -> Result<bool, AppError> {
        Ok(self.conn().exists(key).await?)
    }

    pub async fn health_check(&self) -> CacheHealth {
        let start = Instant::now();
        let result: redis::RedisResult<String> =
            redis::cmd("PING").query_async(&mut self.conn()).await;
        if let Err(e) = &result {
            warn!(error = %e, "redis health check failed");
        }
        CacheHealth {
            healthy: result.is_ok(),
            response_time_ms: start.elapsed().as_millis() as u64,
        }
    }

    /// Parses a subset of `INFO stats`.
    pub async fn stats(&self) -> Result<CacheStats, AppError> {
        let info: String = redis::cmd("INFO")
            .arg("stats")
            .query_async(&mut self.conn())
            .await?;
        Ok(CacheStats::parse(&info))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheHealth {
    pub healthy: bool,
    pub response_time_ms: u64,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct CacheStats {
    pub total_connections: u64,
    pub total_commands: u64,
    pub keyspace_hits: u64,
    pub keyspace_misses: u64,
}

impl CacheStats {
    pub fn parse(info: &str) -> Self {
        let mut stats = Self::default();
        for (key, value) in info.lines().filter_map(|l| l.trim().split_once(':')) {
            let value = value.parse().unwrap_or(0);
            match key {
                "total_connections_received" => stats.total_connections = value,
                "total_commands_processed" => stats.total_commands = value,
                "keyspace_hits" => stats.keyspace_hits = value,
                "keyspace_misses" => stats.keyspace_misses = value,
                _ => {}
            }
        }
        stats
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_redis_info_output() {
        let info = "# Stats\r\ntotal_connections_received:12\r\ntotal_commands_processed:340\r\nkeyspace_hits:7\r\nkeyspace_misses:3\r\nother:1\r\n";
        assert_eq!(
            CacheStats::parse(info),
            CacheStats {
                total_connections: 12,
                total_commands: 340,
                keyspace_hits: 7,
                keyspace_misses: 3,
            }
        );
    }
}
