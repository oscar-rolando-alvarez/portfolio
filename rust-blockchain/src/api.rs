use crate::blockchain::{Blockchain, ChainStats};
use crate::bip39_wallet::BIP39Wallet;
use crate::error::{BlockchainError, Result};
use crate::mempool::MempoolStats;
use crate::mining::{MiningConfig, MiningStats, Miner};
use crate::smart_contracts::{ContractCall, ContractDeployment, SmartContractVM};
use crate::wallet::{TransactionSummary, Wallet, WalletInfo};
use crate::{Address, Amount, Block, Hash, Transaction};
use actix_cors::Cors;
use actix_web::{
    middleware::Logger,
    web::{self, Data, Json, Path, Query},
    App, HttpResponse, HttpServer, Result as ActixResult,
};
use bip39::MnemonicType;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// API Response types
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

// Request types
#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub name: String,
    pub mnemonic_type: Option<String>, // "words12", "words24"
}

#[derive(Debug, Deserialize)]
pub struct RestoreWalletRequest {
    pub name: String,
    pub mnemonic: String,
    pub passphrase: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SendTransactionRequest {
    pub from: Address,
    pub to: Address,
    pub amount: Amount,
    pub fee: Amount,
}

#[derive(Debug, Deserialize)]
pub struct DeployContractRequest {
    pub code: String, // hex-encoded WASM
    pub deployer: Address,
    pub gas_limit: u64,
    pub value: Amount,
}

#[derive(Debug, Deserialize)]
pub struct CallContractRequest {
    pub contract_address: Address,
    pub caller: Address,
    pub function_name: String,
    pub gas_limit: u64,
    pub value: Amount,
}

#[derive(Debug, Deserialize)]
pub struct MiningStartRequest {
    pub miner_address: Address,
    pub thread_count: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct QueryParams {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

// Application state
pub struct AppState {
    blockchain: Arc<Mutex<Blockchain>>,
    wallets: Arc<Mutex<Vec<BIP39Wallet>>>,
    miner: Arc<Mutex<Option<Miner>>>,
    smart_contract_vm: Arc<Mutex<SmartContractVM>>,
}

impl AppState {
    pub fn new(blockchain: Blockchain) -> Self {
        Self {
            blockchain: Arc::new(Mutex::new(blockchain)),
            wallets: Arc::new(Mutex::new(Vec::new())),
            miner: Arc::new(Mutex::new(None)),
            smart_contract_vm: Arc::new(Mutex::new(SmartContractVM::new().unwrap())),
        }
    }
}

// Blockchain endpoints
pub async fn get_chain_info(state: Data<AppState>) -> ActixResult<HttpResponse> {
    let blockchain = state.blockchain.lock().unwrap();
    let stats = blockchain.get_chain_stats();
    Ok(HttpResponse::Ok().json(ApiResponse::success(stats)))
}

pub async fn get_block_by_height(
    state: Data<AppState>,
    path: Path<u64>,
) -> ActixResult<HttpResponse> {
    let height = path.into_inner();
    let blockchain = state.blockchain.lock().unwrap();
    
    match blockchain.get_block_by_height(height) {
        Some(block) => Ok(HttpResponse::Ok().json(ApiResponse::success(block))),
        None => Ok(HttpResponse::NotFound().json(ApiResponse::<Block>::error(
            "Block not found".to_string(),
        ))),
    }
}

pub async fn get_block_by_hash(
    state: Data<AppState>,
    path: Path<String>,
) -> ActixResult<HttpResponse> {
    let hash = path.into_inner();
    let blockchain = state.blockchain.lock().unwrap();
    
    match blockchain.get_block_by_hash(&hash) {
        Some(block) => Ok(HttpResponse::Ok().json(ApiResponse::success(block))),
        None => Ok(HttpResponse::NotFound().json(ApiResponse::<Block>::error(
            "Block not found".to_string(),
        ))),
    }
}

pub async fn get_latest_blocks(
    state: Data<AppState>,
    query: Query<QueryParams>,
) -> ActixResult<HttpResponse> {
    let blockchain = state.blockchain.lock().unwrap();
    let limit = query.limit.unwrap_or(10).min(100);
    let current_height = blockchain.get_chain_height();
    
    let mut blocks = Vec::new();
    for i in 0..limit {
        if current_height >= i as u64 {
            let height = current_height - i as u64;
            if let Some(block) = blockchain.get_block_by_height(height) {
                blocks.push(block.clone());
            }
        }
    }
    
    Ok(HttpResponse::Ok().json(ApiResponse::success(blocks)))
}

// Transaction endpoints
pub async fn submit_transaction(
    state: Data<AppState>,
    transaction: Json<Transaction>,
) -> ActixResult<HttpResponse> {
    let mut blockchain = state.blockchain.lock().unwrap();
    
    match blockchain.add_transaction(transaction.into_inner()) {
        Ok(_) => Ok(HttpResponse::Ok().json(ApiResponse::success("Transaction submitted"))),
        Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
            e.to_string(),
        ))),
    }
}

pub async fn get_mempool_info(state: Data<AppState>) -> ActixResult<HttpResponse> {
    let blockchain = state.blockchain.lock().unwrap();
    let transactions = blockchain.get_mempool_transactions(100);
    
    let mempool_info = MempoolInfo {
        transaction_count: transactions.len(),
        transactions: transactions.into_iter().cloned().collect(),
    };
    
    Ok(HttpResponse::Ok().json(ApiResponse::success(mempool_info)))
}

#[derive(Debug, Serialize)]
struct MempoolInfo {
    transaction_count: usize,
    transactions: Vec<Transaction>,
}

// Wallet endpoints
pub async fn create_wallet(
    state: Data<AppState>,
    request: Json<CreateWalletRequest>,
) -> ActixResult<HttpResponse> {
    let mnemonic_type = match request.mnemonic_type.as_deref() {
        Some("words24") => MnemonicType::Words24,
        _ => MnemonicType::Words12,
    };
    
    match BIP39Wallet::new(request.name.clone(), mnemonic_type) {
        Ok(wallet) => {
            let wallet_info = WalletInfo::from(&wallet.wallet);
            state.wallets.lock().unwrap().push(wallet);
            Ok(HttpResponse::Ok().json(ApiResponse::success(wallet_info)))
        }
        Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<WalletInfo>::error(
            e.to_string(),
        ))),
    }
}

pub async fn restore_wallet(
    state: Data<AppState>,
    request: Json<RestoreWalletRequest>,
) -> ActixResult<HttpResponse> {
    let passphrase = request.passphrase.as_deref().unwrap_or("");
    
    match BIP39Wallet::from_mnemonic(request.name.clone(), &request.mnemonic, passphrase) {
        Ok(wallet) => {
            let wallet_info = WalletInfo::from(&wallet.wallet);
            state.wallets.lock().unwrap().push(wallet);
            Ok(HttpResponse::Ok().json(ApiResponse::success(wallet_info)))
        }
        Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<WalletInfo>::error(
            e.to_string(),
        ))),
    }
}

pub async fn list_wallets(state: Data<AppState>) -> ActixResult<HttpResponse> {
    let wallets = state.wallets.lock().unwrap();
    let wallet_infos: Vec<WalletInfo> = wallets.iter().map(|w| WalletInfo::from(&w.wallet)).collect();
    Ok(HttpResponse::Ok().json(ApiResponse::success(wallet_infos)))
}

pub async fn get_wallet_balance(
    state: Data<AppState>,
    path: Path<String>,
) -> ActixResult<HttpResponse> {
    let wallet_name = path.into_inner();
    let wallets = state.wallets.lock().unwrap();
    let blockchain = state.blockchain.lock().unwrap();
    
    if let Some(wallet) = wallets.iter().find(|w| w.wallet.name == wallet_name) {
        let balance = wallet.wallet.get_balance(blockchain.get_utxo_set());
        
        #[derive(Serialize)]
        struct BalanceResponse {
            wallet_name: String,
            balance: Amount,
        }
        
        let response = BalanceResponse {
            wallet_name: wallet_name.clone(),
            balance,
        };
        
        Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
    } else {
        Ok(HttpResponse::NotFound().json(ApiResponse::<String>::error(
            "Wallet not found".to_string(),
        )))
    }
}

pub async fn generate_address(
    state: Data<AppState>,
    path: Path<String>,
) -> ActixResult<HttpResponse> {
    let wallet_name = path.into_inner();
    let mut wallets = state.wallets.lock().unwrap();
    
    if let Some(wallet) = wallets.iter_mut().find(|w| w.wallet.name == wallet_name) {
        match wallet.generate_next_address() {
            Ok(address) => {
                #[derive(Serialize)]
                struct AddressResponse {
                    address: String,
                }
                
                Ok(HttpResponse::Ok().json(ApiResponse::success(AddressResponse { address })))
            }
            Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
                e.to_string(),
            ))),
        }
    } else {
        Ok(HttpResponse::NotFound().json(ApiResponse::<String>::error(
            "Wallet not found".to_string(),
        )))
    }
}

pub async fn send_transaction(
    state: Data<AppState>,
    request: Json<SendTransactionRequest>,
) -> ActixResult<HttpResponse> {
    let wallets = state.wallets.lock().unwrap();
    let mut blockchain = state.blockchain.lock().unwrap();
    
    // Find wallet that contains the from address
    if let Some(wallet) = wallets.iter().find(|w| w.wallet.contains_address(&request.from)) {
        match wallet.wallet.create_transaction(
            request.to.clone(),
            request.amount,
            request.fee,
            blockchain.get_utxo_set(),
            blockchain.get_chain_height(),
        ) {
            Ok(transaction) => {
                match blockchain.add_transaction(transaction.clone()) {
                    Ok(_) => {
                        #[derive(Serialize)]
                        struct TxResponse {
                            txid: String,
                        }
                        
                        Ok(HttpResponse::Ok().json(ApiResponse::success(TxResponse {
                            txid: transaction.id,
                        })))
                    }
                    Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
                        e.to_string(),
                    ))),
                }
            }
            Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
                e.to_string(),
            ))),
        }
    } else {
        Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
            "Sender address not found in any wallet".to_string(),
        )))
    }
}

// Mining endpoints
pub async fn start_mining(
    state: Data<AppState>,
    request: Json<MiningStartRequest>,
) -> ActixResult<HttpResponse> {
    let config = MiningConfig {
        max_threads: request.thread_count.unwrap_or(num_cpus::get()),
        target_difficulty: 1,
        miner_address: request.miner_address.clone(),
        extra_nonce: 0,
    };
    
    let miner = Miner::new(config);
    *state.miner.lock().unwrap() = Some(miner);
    
    Ok(HttpResponse::Ok().json(ApiResponse::success("Mining started")))
}

pub async fn stop_mining(state: Data<AppState>) -> ActixResult<HttpResponse> {
    if let Some(miner) = state.miner.lock().unwrap().as_ref() {
        miner.stop_mining();
        Ok(HttpResponse::Ok().json(ApiResponse::success("Mining stopped")))
    } else {
        Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
            "No active miner".to_string(),
        )))
    }
}

pub async fn get_mining_stats(state: Data<AppState>) -> ActixResult<HttpResponse> {
    if let Some(miner) = state.miner.lock().unwrap().as_ref() {
        let stats = miner.get_stats();
        Ok(HttpResponse::Ok().json(ApiResponse::success(stats)))
    } else {
        Ok(HttpResponse::Ok().json(ApiResponse::success(MiningStats::default())))
    }
}

// Smart contract endpoints
pub async fn deploy_contract(
    state: Data<AppState>,
    request: Json<DeployContractRequest>,
) -> ActixResult<HttpResponse> {
    let code = match hex::decode(&request.code) {
        Ok(code) => code,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
                "Invalid hex code".to_string(),
            )));
        }
    };
    
    let deployment = ContractDeployment {
        code,
        constructor_params: Vec::new(),
        deployer: request.deployer.clone(),
        gas_limit: request.gas_limit,
        value: request.value,
    };
    
    let mut vm = state.smart_contract_vm.lock().unwrap();
    match vm.deploy_contract(deployment) {
        Ok(address) => {
            #[derive(Serialize)]
            struct ContractResponse {
                contract_address: String,
            }
            
            Ok(HttpResponse::Ok().json(ApiResponse::success(ContractResponse {
                contract_address: address,
            })))
        }
        Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
            e.to_string(),
        ))),
    }
}

pub async fn call_contract(
    state: Data<AppState>,
    request: Json<CallContractRequest>,
) -> ActixResult<HttpResponse> {
    let call = ContractCall {
        contract_address: request.contract_address.clone(),
        caller: request.caller.clone(),
        function_name: request.function_name.clone(),
        parameters: Vec::new(),
        gas_limit: request.gas_limit,
        value: request.value,
    };
    
    let mut vm = state.smart_contract_vm.lock().unwrap();
    match vm.call_contract(call) {
        Ok(result) => Ok(HttpResponse::Ok().json(ApiResponse::success(result))),
        Err(e) => Ok(HttpResponse::BadRequest().json(ApiResponse::<String>::error(
            e.to_string(),
        ))),
    }
}

pub async fn get_contract_info(
    state: Data<AppState>,
    path: Path<String>,
) -> ActixResult<HttpResponse> {
    let contract_address = path.into_inner();
    let vm = state.smart_contract_vm.lock().unwrap();
    
    if let Some(contract) = vm.get_contract(&contract_address) {
        Ok(HttpResponse::Ok().json(ApiResponse::success(contract)))
    } else {
        Ok(HttpResponse::NotFound().json(ApiResponse::<String>::error(
            "Contract not found".to_string(),
        )))
    }
}

// Utility endpoints
pub async fn estimate_fee(
    state: Data<AppState>,
    query: Query<EstimateFeeQuery>,
) -> ActixResult<HttpResponse> {
    let blockchain = state.blockchain.lock().unwrap();
    let target_blocks = query.target_blocks.unwrap_or(6);
    let fee = blockchain.estimate_fee(target_blocks);
    
    #[derive(Serialize)]
    struct FeeEstimate {
        fee_per_byte: u64,
        target_blocks: u32,
    }
    
    Ok(HttpResponse::Ok().json(ApiResponse::success(FeeEstimate {
        fee_per_byte: fee,
        target_blocks,
    })))
}

#[derive(Deserialize)]
struct EstimateFeeQuery {
    target_blocks: Option<u32>,
}

pub async fn health_check() -> ActixResult<HttpResponse> {
    #[derive(Serialize)]
    struct HealthResponse {
        status: String,
        timestamp: chrono::DateTime<chrono::Utc>,
    }
    
    Ok(HttpResponse::Ok().json(ApiResponse::success(HealthResponse {
        status: "healthy".to_string(),
        timestamp: chrono::Utc::now(),
    })))
}

// Main server function
pub async fn start_api_server(
    blockchain: Blockchain,
    bind_address: &str,
) -> std::io::Result<()> {
    let app_state = Data::new(AppState::new(blockchain));
    
    println!("Starting API server on {}", bind_address);
    
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allowed_origin_fn(|_origin, _req_head| true)
                    .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                    .allowed_headers(vec!["Content-Type", "Authorization"])
                    .max_age(3600),
            )
            .service(
                web::scope("/api/v1")
                    // Blockchain endpoints
                    .route("/chain/info", web::get().to(get_chain_info))
                    .route("/blocks/latest", web::get().to(get_latest_blocks))
                    .route("/block/height/{height}", web::get().to(get_block_by_height))
                    .route("/block/hash/{hash}", web::get().to(get_block_by_hash))
                    
                    // Transaction endpoints
                    .route("/transaction", web::post().to(submit_transaction))
                    .route("/mempool", web::get().to(get_mempool_info))
                    
                    // Wallet endpoints
                    .route("/wallet", web::post().to(create_wallet))
                    .route("/wallet/restore", web::post().to(restore_wallet))
                    .route("/wallets", web::get().to(list_wallets))
                    .route("/wallet/{name}/balance", web::get().to(get_wallet_balance))
                    .route("/wallet/{name}/address", web::post().to(generate_address))
                    .route("/send", web::post().to(send_transaction))
                    
                    // Mining endpoints
                    .route("/mining/start", web::post().to(start_mining))
                    .route("/mining/stop", web::post().to(stop_mining))
                    .route("/mining/stats", web::get().to(get_mining_stats))
                    
                    // Smart contract endpoints
                    .route("/contract/deploy", web::post().to(deploy_contract))
                    .route("/contract/call", web::post().to(call_contract))
                    .route("/contract/{address}", web::get().to(get_contract_info))
                    
                    // Utility endpoints
                    .route("/fee/estimate", web::get().to(estimate_fee))
                    .route("/health", web::get().to(health_check))
            )
    })
    .bind(bind_address)?
    .run()
    .await
}

// Add missing trait implementation for Blockchain
impl Blockchain {
    pub fn get_utxo_set(&self) -> &crate::utxo::UTXOSet {
        &self.utxo_set
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};
    use tempfile::TempDir;

    async fn create_test_app() -> App<
        impl actix_web::dev::ServiceFactory<
            actix_web::dev::ServiceRequest,
            Config = (),
            Response = actix_web::dev::ServiceResponse,
            Error = actix_web::Error,
            InitError = (),
        >,
    > {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let config = crate::blockchain::BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
        let app_state = Data::new(AppState::new(blockchain));

        App::new()
            .app_data(app_state)
            .service(
                web::scope("/api/v1")
                    .route("/health", web::get().to(health_check))
                    .route("/chain/info", web::get().to(get_chain_info))
            )
    }

    #[actix_web::test]
    async fn test_health_check() {
        let app = test::init_service(create_test_app().await).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/health")
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert!(resp.status().is_success());
    }

    #[actix_web::test]
    async fn test_chain_info() {
        let app = test::init_service(create_test_app().await).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/chain/info")
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert!(resp.status().is_success());
    }
}