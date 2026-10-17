//! HTTP JSON API served by the node (all routes live under `/api/v1`).

use crate::bip39_wallet::{BIP39Wallet, WordCount};
use crate::blockchain::Blockchain;
use crate::mining::{Miner, MiningConfig, MiningStats};
use crate::network::{NetworkCommand, NetworkCommander};
use crate::smart_contracts::{
    ContractCall, ContractDeployment, ContractParameter, SmartContractVM,
};
use crate::wallet::WalletInfo;
use crate::{Address, Amount, Block, Transaction};
use actix_cors::Cors;
use actix_web::{
    App, HttpResponse, HttpServer, Responder,
    http::StatusCode,
    middleware::Logger,
    web::{self, Data, Json, Path, Query},
};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

pub const API_PREFIX: &str = "/api/v1";
pub const HEALTH_PATH: &str = "/api/v1/health";

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

fn ok<T: Serialize>(data: T) -> HttpResponse {
    HttpResponse::Ok().json(ApiResponse::success(data))
}

fn fail(status: StatusCode, message: impl ToString) -> HttpResponse {
    HttpResponse::build(status).json(ApiResponse::<()>::error(message.to_string()))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub name: String,
    /// `"words12"` (default) or `"words24"`.
    pub mnemonic_type: Option<String>,
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
    /// Hex-encoded WebAssembly (binary or text format).
    pub code: String,
    pub deployer: Address,
    pub gas_limit: u64,
    pub value: Amount,
    #[serde(default)]
    pub constructor_params: Vec<ContractParameter>,
}

#[derive(Debug, Deserialize)]
pub struct CallContractRequest {
    pub contract_address: Address,
    pub caller: Address,
    pub function_name: String,
    pub gas_limit: u64,
    pub value: Amount,
    #[serde(default)]
    pub parameters: Vec<ContractParameter>,
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

#[derive(Debug, Deserialize)]
pub struct EstimateFeeQuery {
    pub target_blocks: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct MempoolInfo {
    pub transaction_count: usize,
    pub transactions: Vec<Transaction>,
}

#[derive(Debug, Serialize)]
pub struct CreateWalletResponse {
    pub wallet: WalletInfo,
    pub mnemonic: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MiningStatus {
    pub active: bool,
    pub miner_address: Option<Address>,
    pub stats: MiningStats,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub height: u64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Shared state for all handlers.
pub struct AppState {
    blockchain: Arc<Mutex<Blockchain>>,
    wallets: Mutex<Vec<BIP39Wallet>>,
    miner: Mutex<Option<Arc<Miner>>>,
    mining_active: Arc<AtomicBool>,
    smart_contract_vm: Mutex<SmartContractVM>,
    network: Option<NetworkCommander>,
}

impl AppState {
    pub fn new(blockchain: Blockchain) -> Self {
        Self::from_shared(Arc::new(Mutex::new(blockchain)))
    }

    /// Build state around a chain that is also used elsewhere (e.g. by the P2P layer).
    pub fn from_shared(blockchain: Arc<Mutex<Blockchain>>) -> Self {
        Self {
            blockchain,
            wallets: Mutex::new(Vec::new()),
            miner: Mutex::new(None),
            mining_active: Arc::new(AtomicBool::new(false)),
            smart_contract_vm: Mutex::new(
                SmartContractVM::new().expect("wasm engine with default config"),
            ),
            network: None,
        }
    }

    /// Broadcast accepted transactions and mined blocks to peers.
    pub fn with_network(mut self, network: NetworkCommander) -> Self {
        self.network = Some(network);
        self
    }

    pub fn blockchain(&self) -> Arc<Mutex<Blockchain>> {
        Arc::clone(&self.blockchain)
    }

    fn broadcast(&self, command: NetworkCommand) {
        if let Some(network) = &self.network
            && let Err(e) = network.try_send(command)
        {
            log::warn!("Failed to queue broadcast: {e}");
        }
    }
}

// ---------------------------------------------------------------------------
// Blockchain endpoints
// ---------------------------------------------------------------------------

pub async fn get_chain_info(state: Data<AppState>) -> impl Responder {
    ok(lock(&state.blockchain).get_chain_stats())
}

pub async fn get_block_by_height(state: Data<AppState>, path: Path<u64>) -> impl Responder {
    match lock(&state.blockchain).get_block_by_height(path.into_inner()) {
        Some(block) => ok(block),
        None => fail(StatusCode::NOT_FOUND, "Block not found"),
    }
}

pub async fn get_block_by_hash(state: Data<AppState>, path: Path<String>) -> impl Responder {
    match lock(&state.blockchain).get_block_by_hash(&path.into_inner()) {
        Some(block) => ok(block),
        None => fail(StatusCode::NOT_FOUND, "Block not found"),
    }
}

pub async fn get_latest_blocks(state: Data<AppState>, query: Query<QueryParams>) -> impl Responder {
    let blockchain = lock(&state.blockchain);
    let limit = query.limit.unwrap_or(10).min(100) as u64;
    let offset = query.offset.unwrap_or(0) as u64;
    let tip = blockchain.get_chain_height();

    let blocks: Vec<Block> = (0..limit)
        .filter_map(|i| tip.checked_sub(offset + i))
        .filter_map(|height| blockchain.get_block_by_height(height).cloned())
        .collect();

    ok(blocks)
}

// ---------------------------------------------------------------------------
// Transaction endpoints
// ---------------------------------------------------------------------------

pub async fn submit_transaction(
    state: Data<AppState>,
    transaction: Json<Transaction>,
) -> impl Responder {
    let transaction = transaction.into_inner();
    let result = lock(&state.blockchain).add_transaction(transaction.clone());
    match result {
        Ok(()) => {
            let txid = transaction.id.clone();
            state.broadcast(NetworkCommand::BroadcastTransaction(transaction));
            ok(serde_json::json!({ "txid": txid }))
        }
        Err(e) => fail(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn get_transaction(state: Data<AppState>, path: Path<String>) -> impl Responder {
    let txid = path.into_inner();
    let blockchain = lock(&state.blockchain);
    if let Some(tx) = blockchain.get_mempool().get_transaction(&txid) {
        return ok(serde_json::json!({ "confirmed": false, "transaction": tx }));
    }
    match blockchain.get_transaction(&txid) {
        Some(tx) => ok(serde_json::json!({ "confirmed": true, "transaction": tx })),
        None => fail(StatusCode::NOT_FOUND, "Transaction not found"),
    }
}

pub async fn get_mempool_info(state: Data<AppState>) -> impl Responder {
    let blockchain = lock(&state.blockchain);
    let transactions: Vec<Transaction> = blockchain
        .get_mempool_transactions(100)
        .into_iter()
        .cloned()
        .collect();

    ok(MempoolInfo {
        transaction_count: blockchain.get_mempool().size(),
        transactions,
    })
}

pub async fn get_address_balance(state: Data<AppState>, path: Path<String>) -> impl Responder {
    let address = path.into_inner();
    let balance = lock(&state.blockchain).get_balance(&address);
    ok(serde_json::json!({ "address": address, "balance": balance }))
}

// ---------------------------------------------------------------------------
// Wallet endpoints
// ---------------------------------------------------------------------------

pub async fn create_wallet(
    state: Data<AppState>,
    request: Json<CreateWalletRequest>,
) -> impl Responder {
    let word_count = match request.mnemonic_type.as_deref() {
        None | Some("words12") => WordCount::Words12,
        Some("words24") => WordCount::Words24,
        Some(other) => {
            return fail(
                StatusCode::BAD_REQUEST,
                format!("Unsupported mnemonic_type '{other}' (use words12 or words24)"),
            );
        }
    };

    let mut wallets = lock(&state.wallets);
    if wallets.iter().any(|w| w.wallet.name == request.name) {
        return fail(StatusCode::CONFLICT, "Wallet already exists");
    }

    match BIP39Wallet::new(request.name.clone(), word_count) {
        Ok(wallet) => {
            let response = CreateWalletResponse {
                wallet: WalletInfo::from(&wallet.wallet),
                mnemonic: wallet.mnemonic.clone(),
            };
            wallets.push(wallet);
            ok(response)
        }
        Err(e) => fail(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn restore_wallet(
    state: Data<AppState>,
    request: Json<RestoreWalletRequest>,
) -> impl Responder {
    let passphrase = request.passphrase.as_deref().unwrap_or("");
    let mut wallets = lock(&state.wallets);
    if wallets.iter().any(|w| w.wallet.name == request.name) {
        return fail(StatusCode::CONFLICT, "Wallet already exists");
    }

    match BIP39Wallet::from_mnemonic(request.name.clone(), &request.mnemonic, passphrase) {
        Ok(wallet) => {
            let utxo_set_info = {
                let blockchain = lock(&state.blockchain);
                WalletInfo::with_balance(&wallet.wallet, blockchain.get_utxo_set())
            };
            wallets.push(wallet);
            ok(utxo_set_info)
        }
        Err(e) => fail(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn list_wallets(state: Data<AppState>) -> impl Responder {
    let wallets = lock(&state.wallets);
    let blockchain = lock(&state.blockchain);
    let infos: Vec<WalletInfo> = wallets
        .iter()
        .map(|w| WalletInfo::with_balance(&w.wallet, blockchain.get_utxo_set()))
        .collect();
    ok(infos)
}

pub async fn get_wallet_balance(state: Data<AppState>, path: Path<String>) -> impl Responder {
    let wallet_name = path.into_inner();
    let wallets = lock(&state.wallets);
    let Some(wallet) = wallets.iter().find(|w| w.wallet.name == wallet_name) else {
        return fail(StatusCode::NOT_FOUND, "Wallet not found");
    };
    let balance = wallet
        .wallet
        .get_balance(lock(&state.blockchain).get_utxo_set());
    ok(serde_json::json!({ "wallet_name": wallet_name, "balance": balance }))
}

pub async fn generate_address(state: Data<AppState>, path: Path<String>) -> impl Responder {
    let wallet_name = path.into_inner();
    let mut wallets = lock(&state.wallets);
    let Some(wallet) = wallets.iter_mut().find(|w| w.wallet.name == wallet_name) else {
        return fail(StatusCode::NOT_FOUND, "Wallet not found");
    };
    match wallet.generate_next_address() {
        Ok(address) => ok(serde_json::json!({ "address": address })),
        Err(e) => fail(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn send_transaction(
    state: Data<AppState>,
    request: Json<SendTransactionRequest>,
) -> impl Responder {
    let transaction = {
        let wallets = lock(&state.wallets);
        let Some(wallet) = wallets
            .iter()
            .find(|w| w.wallet.contains_address(&request.from))
        else {
            return fail(
                StatusCode::BAD_REQUEST,
                "Sender address not found in any wallet",
            );
        };

        let mut blockchain = lock(&state.blockchain);
        let tx = match wallet.wallet.create_transaction(
            request.to.clone(),
            request.amount,
            request.fee,
            blockchain.get_utxo_set(),
            blockchain.get_chain_height(),
        ) {
            Ok(tx) => tx,
            Err(e) => return fail(StatusCode::BAD_REQUEST, e),
        };
        if let Err(e) = blockchain.add_transaction(tx.clone()) {
            return fail(StatusCode::BAD_REQUEST, e);
        }
        tx
    };

    let txid = transaction.id.clone();
    state.broadcast(NetworkCommand::BroadcastTransaction(transaction));
    ok(serde_json::json!({ "txid": txid }))
}

// ---------------------------------------------------------------------------
// Mining endpoints
// ---------------------------------------------------------------------------

/// Background loop: build a template, mine it, append it, repeat until stopped.
fn run_mining_loop(
    blockchain: Arc<Mutex<Blockchain>>,
    miner: Arc<Miner>,
    active: Arc<AtomicBool>,
    network: Option<NetworkCommander>,
) {
    while active.load(Ordering::SeqCst) {
        let template = lock(&blockchain).block_template(950_000, 1000);
        match miner.mine_block(
            template.transactions,
            template.previous_hash,
            template.height,
            template.difficulty,
        ) {
            Ok(block) => {
                let result = lock(&blockchain).add_block(block.clone());
                match result {
                    Ok(()) => {
                        log::info!("Mined block #{} {}", block.header.height, block.hash());
                        if let Some(network) = &network
                            && let Err(e) = network.try_send(NetworkCommand::BroadcastBlock(block))
                        {
                            log::warn!("Failed to queue block broadcast: {e}");
                        }
                    }
                    Err(e) => log::warn!("Mined block rejected (stale template?): {e}"),
                }
            }
            Err(e) => {
                if active.load(Ordering::SeqCst) {
                    log::warn!("Mining attempt failed: {e}");
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    }
}

pub async fn start_mining(
    state: Data<AppState>,
    request: Json<MiningStartRequest>,
) -> impl Responder {
    if request.miner_address.trim().is_empty() {
        return fail(StatusCode::BAD_REQUEST, "miner_address is required");
    }
    if state.mining_active.swap(true, Ordering::SeqCst) {
        return fail(StatusCode::CONFLICT, "Mining already running");
    }

    let difficulty = lock(&state.blockchain).calculate_next_difficulty();
    let miner = Arc::new(Miner::new(MiningConfig {
        max_threads: request.thread_count.unwrap_or_else(num_cpus::get).max(1),
        target_difficulty: difficulty,
        miner_address: request.miner_address.clone(),
        extra_nonce: 0,
    }));
    *lock(&state.miner) = Some(Arc::clone(&miner));

    let blockchain = state.blockchain();
    let active = Arc::clone(&state.mining_active);
    let network = state.network.clone();
    let spawned = std::thread::Builder::new()
        .name("api-miner".to_string())
        .spawn(move || run_mining_loop(blockchain, miner, active, network));

    match spawned {
        Ok(_) => ok("Mining started"),
        Err(e) => {
            state.mining_active.store(false, Ordering::SeqCst);
            fail(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn stop_mining(state: Data<AppState>) -> impl Responder {
    if !state.mining_active.swap(false, Ordering::SeqCst) {
        return fail(StatusCode::BAD_REQUEST, "No active miner");
    }
    if let Some(miner) = lock(&state.miner).as_ref() {
        miner.stop_mining();
    }
    ok("Mining stopped")
}

pub async fn get_mining_stats(state: Data<AppState>) -> impl Responder {
    let miner = lock(&state.miner);
    ok(MiningStatus {
        active: state.mining_active.load(Ordering::SeqCst),
        miner_address: miner.as_ref().map(|m| m.config().miner_address.clone()),
        stats: miner.as_ref().map(|m| m.get_stats()).unwrap_or_default(),
    })
}

// ---------------------------------------------------------------------------
// Smart contract endpoints
// ---------------------------------------------------------------------------

pub async fn deploy_contract(
    state: Data<AppState>,
    request: Json<DeployContractRequest>,
) -> impl Responder {
    let Ok(code) = hex::decode(&request.code) else {
        return fail(StatusCode::BAD_REQUEST, "Invalid hex code");
    };

    let request = request.into_inner();
    let deployment = ContractDeployment {
        code,
        constructor_params: request.constructor_params,
        deployer: request.deployer,
        gas_limit: request.gas_limit,
        value: request.value,
    };

    match lock(&state.smart_contract_vm).deploy_contract(deployment) {
        Ok(address) => ok(serde_json::json!({ "contract_address": address })),
        Err(e) => fail(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn call_contract(
    state: Data<AppState>,
    request: Json<CallContractRequest>,
) -> impl Responder {
    let request = request.into_inner();
    let call = ContractCall {
        contract_address: request.contract_address,
        caller: request.caller,
        function_name: request.function_name,
        parameters: request.parameters,
        gas_limit: request.gas_limit,
        value: request.value,
    };

    match lock(&state.smart_contract_vm).call_contract(call) {
        Ok(result) => ok(result),
        Err(e) => fail(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn get_contract_info(state: Data<AppState>, path: Path<String>) -> impl Responder {
    match lock(&state.smart_contract_vm).get_contract(&path.into_inner()) {
        Some(contract) => ok(contract),
        None => fail(StatusCode::NOT_FOUND, "Contract not found"),
    }
}

// ---------------------------------------------------------------------------
// Utility endpoints
// ---------------------------------------------------------------------------

pub async fn estimate_fee(state: Data<AppState>, query: Query<EstimateFeeQuery>) -> impl Responder {
    let target_blocks = query.target_blocks.unwrap_or(6).max(1);
    let fee = lock(&state.blockchain).estimate_fee(target_blocks);
    ok(serde_json::json!({ "fee_per_byte": fee, "target_blocks": target_blocks }))
}

pub async fn health_check(state: Data<AppState>) -> impl Responder {
    let height = lock(&state.blockchain).get_chain_height();
    ok(HealthResponse {
        status: "healthy".to_string(),
        height,
        timestamp: chrono::Utc::now(),
    })
}

/// Register every API route under [`API_PREFIX`].
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope(API_PREFIX)
            .route("/health", web::get().to(health_check))
            // Blockchain
            .route("/chain/info", web::get().to(get_chain_info))
            .route("/blocks/latest", web::get().to(get_latest_blocks))
            .route("/block/height/{height}", web::get().to(get_block_by_height))
            .route("/block/hash/{hash}", web::get().to(get_block_by_hash))
            // Transactions
            .route("/transaction", web::post().to(submit_transaction))
            .route("/transaction/{txid}", web::get().to(get_transaction))
            .route("/mempool", web::get().to(get_mempool_info))
            .route(
                "/address/{address}/balance",
                web::get().to(get_address_balance),
            )
            // Wallets
            .route("/wallet", web::post().to(create_wallet))
            .route("/wallet/restore", web::post().to(restore_wallet))
            .route("/wallets", web::get().to(list_wallets))
            .route("/wallet/{name}/balance", web::get().to(get_wallet_balance))
            .route("/wallet/{name}/address", web::post().to(generate_address))
            .route("/send", web::post().to(send_transaction))
            // Mining
            .route("/mining/start", web::post().to(start_mining))
            .route("/mining/stop", web::post().to(stop_mining))
            .route("/mining/stats", web::get().to(get_mining_stats))
            // Smart contracts
            .route("/contract/deploy", web::post().to(deploy_contract))
            .route("/contract/call", web::post().to(call_contract))
            .route("/contract/{address}", web::get().to(get_contract_info))
            // Utilities
            .route("/fee/estimate", web::get().to(estimate_fee)),
    );
}

/// Serve the API for a chain owned by the server.
pub async fn start_api_server(blockchain: Blockchain, bind_address: &str) -> std::io::Result<()> {
    start_api_server_with_state(Data::new(AppState::new(blockchain)), bind_address).await
}

/// Serve the API with pre-built (possibly shared) state.
pub async fn start_api_server_with_state(
    app_state: Data<AppState>,
    bind_address: &str,
) -> std::io::Result<()> {
    log::info!("Starting API server on {bind_address}");

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .app_data(web::JsonConfig::default().limit(4 * 1024 * 1024))
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                    .allowed_headers(vec!["Content-Type", "Authorization"])
                    .max_age(3600),
            )
            .configure(configure)
    })
    .bind(bind_address)?
    .run()
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain::BlockchainConfig;
    use crate::smart_contracts::SimpleContractCompiler;
    use actix_web::{dev::ServiceResponse, test};
    use serde_json::Value;
    use tempfile::TempDir;

    fn test_state() -> (TempDir, Data<AppState>) {
        let temp_dir = TempDir::new().unwrap();
        let config = BlockchainConfig {
            genesis_difficulty: 4,
            network: "testnet".to_string(),
            ..Default::default()
        };
        let blockchain = Blockchain::new(config, temp_dir.path().join("api.db")).unwrap();
        (temp_dir, Data::new(AppState::new(blockchain)))
    }

    macro_rules! app {
        ($state:expr) => {
            test::init_service(App::new().app_data($state.clone()).configure(configure)).await
        };
    }

    async fn body(resp: ServiceResponse) -> Value {
        test::read_body_json(resp).await
    }

    #[actix_web::test]
    async fn test_health_check() {
        let (_dir, state) = test_state();
        let app = app!(state);
        let resp =
            test::call_service(&app, test::TestRequest::get().uri(HEALTH_PATH).to_request()).await;
        assert!(resp.status().is_success());
        let json = body(resp).await;
        assert_eq!(json["success"], true);
        assert_eq!(json["data"]["status"], "healthy");
        assert_eq!(json["data"]["height"], 0);
    }

    #[actix_web::test]
    async fn test_chain_info_and_blocks() {
        let (_dir, state) = test_state();
        let app = app!(state);

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get()
                    .uri("/api/v1/chain/info")
                    .to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"]["height"], 0);
        assert_eq!(json["data"]["network"], "testnet");
        let best_hash = json["data"]["best_block_hash"]
            .as_str()
            .unwrap()
            .to_string();

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get()
                    .uri("/api/v1/blocks/latest")
                    .to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"].as_array().unwrap().len(), 1);

        let resp = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/block/height/0")
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let resp = test::call_service(
            &app,
            test::TestRequest::get()
                .uri(&format!("/api/v1/block/hash/{best_hash}"))
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let resp = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/block/height/99")
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[actix_web::test]
    async fn test_wallet_lifecycle() {
        let (_dir, state) = test_state();
        let app = app!(state);

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/wallet")
                .set_json(serde_json::json!({ "name": "alice" }))
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());
        let json = body(resp).await;
        assert_eq!(json["data"]["wallet"]["address_count"], 1);
        let mnemonic = json["data"]["mnemonic"].as_str().unwrap().to_string();
        assert_eq!(mnemonic.split(' ').count(), 12);

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/wallet")
                .set_json(serde_json::json!({ "name": "alice" }))
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::CONFLICT);

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/wallet/restore")
                .set_json(serde_json::json!({ "name": "alice2", "mnemonic": mnemonic }))
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/wallet/alice/address")
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get().uri("/api/v1/wallets").to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"].as_array().unwrap().len(), 2);

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get()
                    .uri("/api/v1/wallet/alice/balance")
                    .to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"]["balance"], 0);

        let resp = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/wallet/bob/balance")
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[actix_web::test]
    async fn test_send_without_funds_fails() {
        let (_dir, state) = test_state();
        let app = app!(state);

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::post()
                    .uri("/api/v1/wallet")
                    .set_json(serde_json::json!({ "name": "poor" }))
                    .to_request(),
            )
            .await,
        )
        .await;
        let from = json["data"]["wallet"]["addresses"][0]
            .as_str()
            .unwrap()
            .to_string();

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/send")
                .set_json(serde_json::json!({ "from": from, "to": "x", "amount": 10, "fee": 1 }))
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[actix_web::test]
    async fn test_mining_start_and_stop() {
        let (_dir, state) = test_state();
        let app = app!(state);

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/mining/start")
                .set_json(serde_json::json!({ "miner_address": "api_miner", "thread_count": 1 }))
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        while lock(&state.blockchain).get_chain_height() < 2 {
            assert!(std::time::Instant::now() < deadline, "no blocks mined");
            tokio::time::sleep(Duration::from_millis(20)).await;
        }

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get()
                    .uri("/api/v1/mining/stats")
                    .to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"]["active"], true);

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/mining/stop")
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get()
                    .uri("/api/v1/address/api_miner/balance")
                    .to_request(),
            )
            .await,
        )
        .await;
        assert!(json["data"]["balance"].as_u64().unwrap() >= 2 * crate::BLOCK_REWARD);

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/mining/stop")
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[actix_web::test]
    async fn test_contract_deploy_and_call() {
        let (_dir, state) = test_state();
        let app = app!(state);

        let code = hex::encode(SimpleContractCompiler::compile_simple_storage());
        let json = body(
            test::call_service(
                &app,
                test::TestRequest::post()
                    .uri("/api/v1/contract/deploy")
                    .set_json(serde_json::json!({
                        "code": code, "deployer": "dev", "gas_limit": 1_000_000, "value": 0
                    }))
                    .to_request(),
            )
            .await,
        )
        .await;
        let address = json["data"]["contract_address"]
            .as_str()
            .unwrap()
            .to_string();

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::post()
                    .uri("/api/v1/contract/call")
                    .set_json(serde_json::json!({
                        "contract_address": address, "caller": "dev",
                        "function_name": "add", "gas_limit": 100_000, "value": 0,
                        "parameters": [{ "U64": 5 }]
                    }))
                    .to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"]["success"], true);
        assert_eq!(json["data"]["return_data"][0], 5);

        let resp = test::call_service(
            &app,
            test::TestRequest::get()
                .uri(&format!("/api/v1/contract/{address}"))
                .to_request(),
        )
        .await;
        assert!(resp.status().is_success());

        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/contract/deploy")
                .set_json(serde_json::json!({
                    "code": "zz", "deployer": "dev", "gas_limit": 1, "value": 0
                }))
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[actix_web::test]
    async fn test_mempool_fee_and_unknown_transaction() {
        let (_dir, state) = test_state();
        let app = app!(state);

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get().uri("/api/v1/mempool").to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"]["transaction_count"], 0);

        let json = body(
            test::call_service(
                &app,
                test::TestRequest::get()
                    .uri("/api/v1/fee/estimate?target_blocks=3")
                    .to_request(),
            )
            .await,
        )
        .await;
        assert_eq!(json["data"]["target_blocks"], 3);

        let resp = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/transaction/deadbeef")
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);

        let tx = Transaction::new_coinbase(1, "x".to_string(), 1);
        let resp = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/transaction")
                .set_json(&tx)
                .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }
}
