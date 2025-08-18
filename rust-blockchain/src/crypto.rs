use crate::error::{BlockchainError, Result};
use sha2::{Digest, Sha256};
use secp256k1::{ecdsa::Signature, Message, PublicKey, Secp256k1, SecretKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeyPair {
    pub private_key: Vec<u8>,
    pub public_key: Vec<u8>,
}

impl KeyPair {
    pub fn new() -> Result<Self> {
        let secp = Secp256k1::new();
        let (secret_key, public_key) = secp.generate_keypair(&mut OsRng);
        
        Ok(KeyPair {
            private_key: secret_key.secret_bytes().to_vec(),
            public_key: public_key.serialize().to_vec(),
        })
    }
    
    pub fn from_private_key(private_key: &[u8]) -> Result<Self> {
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_slice(private_key)
            .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
        let public_key = PublicKey::from_secret_key(&secp, &secret_key);
        
        Ok(KeyPair {
            private_key: private_key.to_vec(),
            public_key: public_key.serialize().to_vec(),
        })
    }
    
    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>> {
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_slice(&self.private_key)
            .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
        
        let message_hash = sha256(message);
        let message = Message::from_slice(&message_hash)
            .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
        
        let signature = secp.sign_ecdsa(&message, &secret_key);
        Ok(signature.serialize_compact().to_vec())
    }
    
    pub fn public_key_hash(&self) -> Vec<u8> {
        let public_key_hash = sha256(&self.public_key);
        ripemd160(&public_key_hash)
    }
}

impl Default for KeyPair {
    fn default() -> Self {
        Self::new().unwrap()
    }
}

impl fmt::Display for KeyPair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "KeyPair {{ public_key: {} }}", hex::encode(&self.public_key))
    }
}

pub fn sha256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

pub fn double_sha256(data: &[u8]) -> Vec<u8> {
    let first_hash = sha256(data);
    sha256(&first_hash)
}

pub fn ripemd160(data: &[u8]) -> Vec<u8> {
    use ring::digest;
    // Note: ring doesn't have RIPEMD160, so we'll use SHA256 as a substitute
    // In a real implementation, you'd use a proper RIPEMD160 implementation
    sha256(data)
}

pub fn verify_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool> {
    let secp = Secp256k1::new();
    
    let public_key = PublicKey::from_slice(public_key)
        .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
    
    let message_hash = sha256(message);
    let message = Message::from_slice(&message_hash)
        .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
    
    let signature = Signature::from_compact(signature)
        .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
    
    match secp.verify_ecdsa(&message, &signature, &public_key) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

pub fn hash_to_string(hash: &[u8]) -> String {
    hex::encode(hash)
}

pub fn string_to_hash(s: &str) -> Result<Vec<u8>> {
    hex::decode(s).map_err(|e| BlockchainError::CryptoError(e.to_string()))
}

pub fn generate_random_bytes(length: usize) -> Vec<u8> {
    use rand::RngCore;
    let mut bytes = vec![0u8; length];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

pub fn hash_difficulty_check(hash: &[u8], difficulty: u32) -> bool {
    let target = calculate_target(difficulty);
    let hash_value = bytes_to_u256(hash);
    hash_value < target
}

fn calculate_target(difficulty: u32) -> [u32; 8] {
    // Simplified target calculation
    // In Bitcoin, this is more complex with proper difficulty adjustment
    let mut target = [0xFFFFFFFFu32; 8];
    if difficulty > 0 {
        target[7] = target[7] >> difficulty.min(32);
    }
    target
}

fn bytes_to_u256(bytes: &[u8]) -> [u32; 8] {
    let mut result = [0u32; 8];
    for (i, chunk) in bytes.chunks(4).enumerate() {
        if i >= 8 { break; }
        let mut word_bytes = [0u8; 4];
        word_bytes[..chunk.len()].copy_from_slice(chunk);
        result[i] = u32::from_be_bytes(word_bytes);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let keypair = KeyPair::new().unwrap();
        assert_eq!(keypair.private_key.len(), 32);
        assert_eq!(keypair.public_key.len(), 33);
    }

    #[test]
    fn test_signature_verification() {
        let keypair = KeyPair::new().unwrap();
        let message = b"Hello, blockchain!";
        let signature = keypair.sign(message).unwrap();
        
        assert!(verify_signature(&keypair.public_key, message, &signature).unwrap());
        assert!(!verify_signature(&keypair.public_key, b"Different message", &signature).unwrap());
    }

    #[test]
    fn test_sha256() {
        let data = b"test data";
        let hash = sha256(data);
        assert_eq!(hash.len(), 32);
        
        // Test deterministic
        let hash2 = sha256(data);
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_double_sha256() {
        let data = b"test data";
        let hash = double_sha256(data);
        assert_eq!(hash.len(), 32);
        
        // Verify it's actually double hashing
        let single_hash = sha256(data);
        let manual_double = sha256(&single_hash);
        assert_eq!(hash, manual_double);
    }

    #[test]
    fn test_difficulty_check() {
        let easy_hash = vec![0x00, 0x00, 0x00, 0x00]; // Should pass low difficulty
        let hard_hash = vec![0xFF, 0xFF, 0xFF, 0xFF]; // Should fail most difficulties
        
        assert!(hash_difficulty_check(&easy_hash, 1));
        assert!(!hash_difficulty_check(&hard_hash, 1));
    }
}