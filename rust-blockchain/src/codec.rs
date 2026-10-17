//! Compact binary encoding used for persistence and size accounting.

use crate::error::{BlockchainError, Result};
use serde::{Serialize, de::DeserializeOwned};

/// Serialize a value into the compact binary format.
pub fn encode<T: Serialize + ?Sized>(value: &T) -> Result<Vec<u8>> {
    postcard::to_stdvec(value).map_err(|e| BlockchainError::SerializationError(e.to_string()))
}

/// Deserialize a value previously produced by [`encode`].
pub fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    postcard::from_bytes(bytes).map_err(|e| BlockchainError::SerializationError(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let value = (42u64, String::from("hello"), vec![1u8, 2, 3]);
        let bytes = encode(&value).unwrap();
        let decoded: (u64, String, Vec<u8>) = decode(&bytes).unwrap();
        assert_eq!(value, decoded);
    }

    #[test]
    fn decode_garbage_fails() {
        let result: Result<(u64, String)> = decode(&[0xFF]);
        assert!(result.is_err());
    }
}
