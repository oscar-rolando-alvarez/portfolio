use thiserror::Error;

#[derive(Error, Debug)]
pub enum BlockchainError {
    #[error("Invalid block: {0}")]
    InvalidBlock(String),
    
    #[error("Invalid transaction: {0}")]
    InvalidTransaction(String),
    
    #[error("Invalid signature")]
    InvalidSignature,
    
    #[error("Insufficient funds")]
    InsufficientFunds,
    
    #[error("Block not found: {0}")]
    BlockNotFound(String),
    
    #[error("Transaction not found: {0}")]
    TransactionNotFound(String),
    
    #[error("Invalid address: {0}")]
    InvalidAddress(String),
    
    #[error("Cryptographic error: {0}")]
    CryptoError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Persistence error: {0}")]
    PersistenceError(String),
    
    #[error("Smart contract error: {0}")]
    SmartContractError(String),
    
    #[error("Mining error: {0}")]
    MiningError(String),
    
    #[error("Wallet error: {0}")]
    WalletError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Serde JSON error: {0}")]
    SerdeJsonError(#[from] serde_json::Error),
    
    #[error("Hex decode error: {0}")]
    HexError(#[from] hex::FromHexError),
    
    #[error("Parse error: {0}")]
    ParseError(String),
}

pub type Result<T> = std::result::Result<T, BlockchainError>;