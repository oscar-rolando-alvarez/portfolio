use crate::error::{BlockchainError, Result};
use rand::RngCore;
use ripemd::Ripemd160;
use secp256k1::{Message, PublicKey, SecretKey, ecdsa};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// Version byte prepended to the public key hash when building addresses.
pub const ADDRESS_VERSION: u8 = 0x00;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeyPair {
    pub private_key: Vec<u8>,
    pub public_key: Vec<u8>,
}

impl KeyPair {
    pub fn new() -> Result<Self> {
        let (secret_key, public_key) = secp256k1::generate_keypair(&mut rand::rng());

        Ok(KeyPair {
            private_key: secret_key.to_secret_bytes().to_vec(),
            public_key: public_key.serialize().to_vec(),
        })
    }

    pub fn from_private_key(private_key: &[u8]) -> Result<Self> {
        let secret_key = secret_key_from_slice(private_key)?;
        let public_key = PublicKey::from_secret_key(&secret_key);

        Ok(KeyPair {
            private_key: private_key.to_vec(),
            public_key: public_key.serialize().to_vec(),
        })
    }

    /// Sign the SHA-256 digest of `message` and return a 64 byte compact signature.
    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>> {
        let secret_key = secret_key_from_slice(&self.private_key)?;
        let digest = Message::from_digest(sha256_array(message));
        let signature = ecdsa::sign(digest, &secret_key);
        Ok(signature.serialize_compact().to_vec())
    }

    /// RIPEMD-160 of the SHA-256 of the public key (Bitcoin `HASH160`).
    pub fn public_key_hash(&self) -> Vec<u8> {
        hash160(&self.public_key)
    }

    /// Base58Check address derived from the public key.
    pub fn address(&self) -> String {
        public_key_to_address(&self.public_key)
    }
}

impl fmt::Debug for KeyPair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("KeyPair")
            .field("public_key", &hex::encode(&self.public_key))
            .field("private_key", &"<redacted>")
            .finish()
    }
}

impl fmt::Display for KeyPair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "KeyPair {{ public_key: {} }}",
            hex::encode(&self.public_key)
        )
    }
}

fn secret_key_from_slice(bytes: &[u8]) -> Result<SecretKey> {
    let array: [u8; 32] = bytes.try_into().map_err(|_| {
        BlockchainError::CryptoError(format!("private key must be 32 bytes, got {}", bytes.len()))
    })?;
    SecretKey::from_secret_bytes(array).map_err(|e| BlockchainError::CryptoError(e.to_string()))
}

fn sha256_array(data: &[u8]) -> [u8; 32] {
    Sha256::digest(data).into()
}

pub fn sha256(data: &[u8]) -> Vec<u8> {
    sha256_array(data).to_vec()
}

pub fn double_sha256(data: &[u8]) -> Vec<u8> {
    sha256(&sha256(data))
}

pub fn ripemd160(data: &[u8]) -> Vec<u8> {
    Ripemd160::digest(data).to_vec()
}

/// `RIPEMD160(SHA256(data))`.
pub fn hash160(data: &[u8]) -> Vec<u8> {
    ripemd160(&sha256(data))
}

/// Encode a public key as a Base58Check address (version byte + HASH160 + checksum).
pub fn public_key_to_address(public_key: &[u8]) -> String {
    let mut payload = Vec::with_capacity(25);
    payload.push(ADDRESS_VERSION);
    payload.extend_from_slice(&hash160(public_key));
    let checksum = double_sha256(&payload);
    payload.extend_from_slice(&checksum[..4]);
    bs58::encode(payload).into_string()
}

pub fn verify_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool> {
    let public_key = PublicKey::from_slice(public_key)
        .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
    let signature = ecdsa::Signature::from_compact(signature)
        .map_err(|e| BlockchainError::CryptoError(e.to_string()))?;
    let digest = Message::from_digest(sha256_array(message));

    Ok(ecdsa::verify(&signature, digest, &public_key).is_ok())
}

pub fn hash_to_string(hash: &[u8]) -> String {
    hex::encode(hash)
}

pub fn string_to_hash(s: &str) -> Result<Vec<u8>> {
    hex::decode(s).map_err(|e| BlockchainError::CryptoError(e.to_string()))
}

pub fn generate_random_bytes(length: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; length];
    rand::rng().fill_bytes(&mut bytes);
    bytes
}

/// Number of leading zero bits in `hash`.
pub fn leading_zero_bits(hash: &[u8]) -> u32 {
    let mut bits = 0;
    for byte in hash {
        if *byte == 0 {
            bits += 8;
        } else {
            bits += byte.leading_zeros();
            break;
        }
    }
    bits
}

/// Proof-of-work check: the hash must start with at least `difficulty` zero bits.
pub fn hash_difficulty_check(hash: &[u8], difficulty: u32) -> bool {
    leading_zero_bits(hash) >= difficulty
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
    fn test_keypair_from_private_key_is_deterministic() {
        let keypair = KeyPair::new().unwrap();
        let restored = KeyPair::from_private_key(&keypair.private_key).unwrap();
        assert_eq!(keypair, restored);
        assert!(KeyPair::from_private_key(&[1, 2, 3]).is_err());
        assert!(KeyPair::from_private_key(&[0u8; 32]).is_err());
    }

    #[test]
    fn test_signature_verification() {
        let keypair = KeyPair::new().unwrap();
        let message = b"Hello, blockchain!";
        let signature = keypair.sign(message).unwrap();

        assert!(verify_signature(&keypair.public_key, message, &signature).unwrap());
        assert!(!verify_signature(&keypair.public_key, b"Different message", &signature).unwrap());

        let other = KeyPair::new().unwrap();
        assert!(!verify_signature(&other.public_key, message, &signature).unwrap());
    }

    #[test]
    fn test_sha256_known_vector() {
        assert_eq!(
            hash_to_string(&sha256(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn test_double_sha256() {
        let data = b"test data";
        let hash = double_sha256(data);
        assert_eq!(hash.len(), 32);
        assert_eq!(hash, sha256(&sha256(data)));
    }

    #[test]
    fn test_ripemd160_known_vector() {
        assert_eq!(
            hash_to_string(&ripemd160(b"abc")),
            "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc"
        );
    }

    #[test]
    fn test_address_from_known_public_key() {
        // Public key of the private key 0x...01 (generator point, compressed).
        let public_key =
            hex::decode("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
                .unwrap();
        assert_eq!(
            public_key_to_address(&public_key),
            "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH"
        );
    }

    #[test]
    fn test_difficulty_check() {
        let easy_hash = vec![0x00, 0x00, 0x00, 0x00];
        let hard_hash = vec![0xFF, 0xFF, 0xFF, 0xFF];

        assert!(hash_difficulty_check(&easy_hash, 1));
        assert!(hash_difficulty_check(&easy_hash, 32));
        assert!(!hash_difficulty_check(&hard_hash, 1));
        assert!(hash_difficulty_check(&hard_hash, 0));
        assert_eq!(leading_zero_bits(&[0x00, 0x0F]), 12);
    }

    #[test]
    fn test_random_bytes() {
        let a = generate_random_bytes(32);
        let b = generate_random_bytes(32);
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
    }
}
