use clap::{Arg, Command};
use colored::*;
use rust_blockchain::{
    api::start_api_server,
    bip39_wallet::BIP39Wallet,
    blockchain::{Blockchain, BlockchainConfig},
    mining::{Miner, MiningConfig},
    network::{P2PNetwork, NetworkHandle},
    smart_contracts::SmartContractVM,
    wallet::Wallet,
    Amount, Block, Transaction,
};
use std::io::{self, Write};
use tokio;

#[tokio::main]
async fn main() {
    env_logger::init();

    let matches = Command::new("blockchain-cli")
        .version("0.1.0")
        .author("Blockchain Developer")
        .about("A comprehensive blockchain CLI tool")
        .subcommand(
            Command::new("blockchain")
                .about("Blockchain operations")
                .subcommand(
                    Command::new("init")
                        .about("Initialize a new blockchain")
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        )
                        .arg(
                            Arg::new("network")
                                .short('n')
                                .long("network")
                                .value_name("NETWORK")
                                .help("Network type (mainnet, testnet)")
                                .default_value("testnet"),
                        ),
                )
                .subcommand(
                    Command::new("info")
                        .about("Get blockchain information")
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        ),
                )
                .subcommand(
                    Command::new("blocks")
                        .about("List recent blocks")
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        )
                        .arg(
                            Arg::new("count")
                                .short('c')
                                .long("count")
                                .value_name("COUNT")
                                .help("Number of blocks to show")
                                .default_value("10"),
                        ),
                ),
        )
        .subcommand(
            Command::new("wallet")
                .about("Wallet operations")
                .subcommand(
                    Command::new("create")
                        .about("Create a new wallet")
                        .arg(
                            Arg::new("name")
                                .short('n')
                                .long("name")
                                .value_name("NAME")
                                .help("Wallet name")
                                .required(true),
                        )
                        .arg(
                            Arg::new("words")
                                .short('w')
                                .long("words")
                                .value_name("WORDS")
                                .help("Number of mnemonic words (12 or 24)")
                                .default_value("12"),
                        ),
                )
                .subcommand(
                    Command::new("restore")
                        .about("Restore wallet from mnemonic")
                        .arg(
                            Arg::new("name")
                                .short('n')
                                .long("name")
                                .value_name("NAME")
                                .help("Wallet name")
                                .required(true),
                        )
                        .arg(
                            Arg::new("mnemonic")
                                .short('m')
                                .long("mnemonic")
                                .value_name("MNEMONIC")
                                .help("Mnemonic phrase")
                                .required(true),
                        ),
                )
                .subcommand(
                    Command::new("balance")
                        .about("Check wallet balance")
                        .arg(
                            Arg::new("wallet")
                                .short('w')
                                .long("wallet")
                                .value_name("WALLET")
                                .help("Wallet file path")
                                .required(true),
                        )
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        ),
                )
                .subcommand(
                    Command::new("send")
                        .about("Send a transaction")
                        .arg(
                            Arg::new("wallet")
                                .short('w')
                                .long("wallet")
                                .value_name("WALLET")
                                .help("Wallet file path")
                                .required(true),
                        )
                        .arg(
                            Arg::new("to")
                                .short('t')
                                .long("to")
                                .value_name("ADDRESS")
                                .help("Recipient address")
                                .required(true),
                        )
                        .arg(
                            Arg::new("amount")
                                .short('a')
                                .long("amount")
                                .value_name("AMOUNT")
                                .help("Amount to send")
                                .required(true),
                        )
                        .arg(
                            Arg::new("fee")
                                .short('f')
                                .long("fee")
                                .value_name("FEE")
                                .help("Transaction fee")
                                .default_value("1000"),
                        )
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        ),
                ),
        )
        .subcommand(
            Command::new("mining")
                .about("Mining operations")
                .subcommand(
                    Command::new("start")
                        .about("Start mining")
                        .arg(
                            Arg::new("address")
                                .short('a')
                                .long("address")
                                .value_name("ADDRESS")
                                .help("Mining reward address")
                                .required(true),
                        )
                        .arg(
                            Arg::new("threads")
                                .short('t')
                                .long("threads")
                                .value_name("THREADS")
                                .help("Number of mining threads")
                                .default_value("1"),
                        )
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        ),
                ),
        )
        .subcommand(
            Command::new("network")
                .about("Network operations")
                .subcommand(
                    Command::new("start")
                        .about("Start P2P network node")
                        .arg(
                            Arg::new("port")
                                .short('p')
                                .long("port")
                                .value_name("PORT")
                                .help("P2P port")
                                .default_value("8333"),
                        )
                        .arg(
                            Arg::new("api-port")
                                .long("api-port")
                                .value_name("API_PORT")
                                .help("API server port")
                                .default_value("8080"),
                        )
                        .arg(
                            Arg::new("data-dir")
                                .short('d')
                                .long("data-dir")
                                .value_name("DIR")
                                .help("Data directory path")
                                .required(true),
                        ),
                ),
        )
        .subcommand(
            Command::new("contract")
                .about("Smart contract operations")
                .subcommand(
                    Command::new("deploy")
                        .about("Deploy a smart contract")
                        .arg(
                            Arg::new("code")
                                .short('c')
                                .long("code")
                                .value_name("CODE")
                                .help("Contract code file (WASM)")
                                .required(true),
                        )
                        .arg(
                            Arg::new("deployer")
                                .short('d')
                                .long("deployer")
                                .value_name("ADDRESS")
                                .help("Deployer address")
                                .required(true),
                        )
                        .arg(
                            Arg::new("gas")
                                .short('g')
                                .long("gas")
                                .value_name("GAS")
                                .help("Gas limit")
                                .default_value("1000000"),
                        ),
                )
                .subcommand(
                    Command::new("call")
                        .about("Call a smart contract function")
                        .arg(
                            Arg::new("address")
                                .short('a')
                                .long("address")
                                .value_name("ADDRESS")
                                .help("Contract address")
                                .required(true),
                        )
                        .arg(
                            Arg::new("function")
                                .short('f')
                                .long("function")
                                .value_name("FUNCTION")
                                .help("Function name")
                                .required(true),
                        )
                        .arg(
                            Arg::new("caller")
                                .short('c')
                                .long("caller")
                                .value_name("CALLER")
                                .help("Caller address")
                                .required(true),
                        )
                        .arg(
                            Arg::new("gas")
                                .short('g')
                                .long("gas")
                                .value_name("GAS")
                                .help("Gas limit")
                                .default_value("100000"),
                        ),
                ),
        )
        .get_matches();

    match matches.subcommand() {
        Some(("blockchain", blockchain_matches)) => {
            handle_blockchain_commands(blockchain_matches).await;
        }
        Some(("wallet", wallet_matches)) => {
            handle_wallet_commands(wallet_matches).await;
        }
        Some(("mining", mining_matches)) => {
            handle_mining_commands(mining_matches).await;
        }
        Some(("network", network_matches)) => {
            handle_network_commands(network_matches).await;
        }
        Some(("contract", contract_matches)) => {
            handle_contract_commands(contract_matches).await;
        }
        _ => {
            println!("{}", "No subcommand provided. Use --help for usage information.".red());
        }
    }
}

async fn handle_blockchain_commands(matches: &clap::ArgMatches) {
    match matches.subcommand() {
        Some(("init", init_matches)) => {
            let data_dir = init_matches.get_one::<String>("data-dir").unwrap();
            let network = init_matches.get_one::<String>("network").unwrap();

            println!("{}", format!("Initializing blockchain in {}...", data_dir).green());

            let config = BlockchainConfig {
                network: network.clone(),
                ..Default::default()
            };

            let db_path = format!("{}/blockchain.db", data_dir);
            std::fs::create_dir_all(data_dir).expect("Failed to create data directory");

            match Blockchain::new(config, &db_path) {
                Ok(_) => {
                    println!("{}", "Blockchain initialized successfully!".green());
                    println!("Network: {}", network.cyan());
                    println!("Data directory: {}", data_dir.cyan());
                }
                Err(e) => {
                    println!("{}", format!("Failed to initialize blockchain: {}", e).red());
                }
            }
        }
        Some(("info", info_matches)) => {
            let data_dir = info_matches.get_one::<String>("data-dir").unwrap();
            let db_path = format!("{}/blockchain.db", data_dir);

            match load_blockchain(&db_path) {
                Ok(blockchain) => {
                    let stats = blockchain.get_chain_stats();
                    println!("{}", "Blockchain Information".bold().green());
                    println!("Height: {}", stats.height.to_string().cyan());
                    println!("Difficulty: {}", stats.difficulty.to_string().cyan());
                    println!("Total Transactions: {}", stats.total_transactions.to_string().cyan());
                    println!("Total Supply: {}", format_amount(stats.total_supply).cyan());
                    println!("Mempool Size: {}", stats.mempool_size.to_string().cyan());
                    println!("UTXO Count: {}", stats.utxo_count.to_string().cyan());
                }
                Err(e) => {
                    println!("{}", format!("Error loading blockchain: {}", e).red());
                }
            }
        }
        Some(("blocks", blocks_matches)) => {
            let data_dir = blocks_matches.get_one::<String>("data-dir").unwrap();
            let count: usize = blocks_matches
                .get_one::<String>("count")
                .unwrap()
                .parse()
                .unwrap_or(10);
            let db_path = format!("{}/blockchain.db", data_dir);

            match load_blockchain(&db_path) {
                Ok(blockchain) => {
                    println!("{}", "Recent Blocks".bold().green());
                    let current_height = blockchain.get_chain_height();

                    for i in 0..count.min(current_height as usize + 1) {
                        let height = current_height.saturating_sub(i as u64);
                        if let Some(block) = blockchain.get_block_by_height(height) {
                            println!(
                                "Block #{}: {} ({} txs)",
                                height.to_string().cyan(),
                                blockchain.calculate_block_hash(block)[..16].yellow(),
                                block.transactions.len().to_string().magenta()
                            );
                        }
                    }
                }
                Err(e) => {
                    println!("{}", format!("Error loading blockchain: {}", e).red());
                }
            }
        }
        _ => {
            println!("{}", "Unknown blockchain command".red());
        }
    }
}

async fn handle_wallet_commands(matches: &clap::ArgMatches) {
    match matches.subcommand() {
        Some(("create", create_matches)) => {
            let name = create_matches.get_one::<String>("name").unwrap();
            let words: u32 = create_matches
                .get_one::<String>("words")
                .unwrap()
                .parse()
                .unwrap_or(12);

            let mnemonic_type = match words {
                24 => bip39::MnemonicType::Words24,
                _ => bip39::MnemonicType::Words12,
            };

            match BIP39Wallet::new(name.clone(), mnemonic_type) {
                Ok(wallet) => {
                    let wallet_file = format!("{}.wallet", name);
                    if let Err(e) = wallet.wallet.save_to_file(&wallet_file) {
                        println!("{}", format!("Failed to save wallet: {}", e).red());
                        return;
                    }

                    println!("{}", "Wallet created successfully!".green());
                    println!("Name: {}", name.cyan());
                    println!("File: {}", wallet_file.cyan());
                    
                    if let Some(mnemonic) = wallet.get_mnemonic() {
                        println!("{}", "IMPORTANT: Save your mnemonic phrase safely!".yellow().bold());
                        println!("Mnemonic: {}", mnemonic.red().bold());
                    }

                    if !wallet.wallet.addresses.is_empty() {
                        println!("First address: {}", wallet.wallet.addresses[0].cyan());
                    }
                }
                Err(e) => {
                    println!("{}", format!("Failed to create wallet: {}", e).red());
                }
            }
        }
        Some(("restore", restore_matches)) => {
            let name = restore_matches.get_one::<String>("name").unwrap();
            let mnemonic = restore_matches.get_one::<String>("mnemonic").unwrap();

            match BIP39Wallet::from_mnemonic(name.clone(), mnemonic, "") {
                Ok(wallet) => {
                    let wallet_file = format!("{}.wallet", name);
                    if let Err(e) = wallet.wallet.save_to_file(&wallet_file) {
                        println!("{}", format!("Failed to save wallet: {}", e).red());
                        return;
                    }

                    println!("{}", "Wallet restored successfully!".green());
                    println!("Name: {}", name.cyan());
                    println!("File: {}", wallet_file.cyan());
                    
                    if !wallet.wallet.addresses.is_empty() {
                        println!("First address: {}", wallet.wallet.addresses[0].cyan());
                    }
                }
                Err(e) => {
                    println!("{}", format!("Failed to restore wallet: {}", e).red());
                }
            }
        }
        Some(("balance", balance_matches)) => {
            let wallet_file = balance_matches.get_one::<String>("wallet").unwrap();
            let data_dir = balance_matches.get_one::<String>("data-dir").unwrap();
            let db_path = format!("{}/blockchain.db", data_dir);

            match (Wallet::load_from_file(wallet_file), load_blockchain(&db_path)) {
                (Ok(wallet), Ok(blockchain)) => {
                    let balance = wallet.get_balance(blockchain.get_utxo_set());
                    println!("{}", "Wallet Balance".bold().green());
                    println!("Wallet: {}", wallet.name.cyan());
                    println!("Balance: {}", format_amount(balance).cyan());
                    println!("Addresses: {}", wallet.addresses.len().to_string().cyan());
                }
                (Err(e), _) => {
                    println!("{}", format!("Failed to load wallet: {}", e).red());
                }
                (_, Err(e)) => {
                    println!("{}", format!("Failed to load blockchain: {}", e).red());
                }
            }
        }
        Some(("send", send_matches)) => {
            let wallet_file = send_matches.get_one::<String>("wallet").unwrap();
            let to_address = send_matches.get_one::<String>("to").unwrap();
            let amount: Amount = send_matches
                .get_one::<String>("amount")
                .unwrap()
                .parse()
                .expect("Invalid amount");
            let fee: Amount = send_matches
                .get_one::<String>("fee")
                .unwrap()
                .parse()
                .expect("Invalid fee");
            let data_dir = send_matches.get_one::<String>("data-dir").unwrap();
            let db_path = format!("{}/blockchain.db", data_dir);

            match (Wallet::load_from_file(wallet_file), load_blockchain(&db_path)) {
                (Ok(wallet), Ok(mut blockchain)) => {
                    if wallet.addresses.is_empty() {
                        println!("{}", "No addresses in wallet".red());
                        return;
                    }

                    let from_address = &wallet.addresses[0];
                    match wallet.create_transaction(
                        to_address.clone(),
                        amount,
                        fee,
                        blockchain.get_utxo_set(),
                        blockchain.get_chain_height(),
                    ) {
                        Ok(transaction) => {
                            match blockchain.add_transaction(transaction.clone()) {
                                Ok(_) => {
                                    println!("{}", "Transaction submitted successfully!".green());
                                    println!("Transaction ID: {}", transaction.id.cyan());
                                    println!("From: {}", from_address.cyan());
                                    println!("To: {}", to_address.cyan());
                                    println!("Amount: {}", format_amount(amount).cyan());
                                    println!("Fee: {}", format_amount(fee).cyan());
                                }
                                Err(e) => {
                                    println!("{}", format!("Failed to submit transaction: {}", e).red());
                                }
                            }
                        }
                        Err(e) => {
                            println!("{}", format!("Failed to create transaction: {}", e).red());
                        }
                    }
                }
                (Err(e), _) => {
                    println!("{}", format!("Failed to load wallet: {}", e).red());
                }
                (_, Err(e)) => {
                    println!("{}", format!("Failed to load blockchain: {}", e).red());
                }
            }
        }
        _ => {
            println!("{}", "Unknown wallet command".red());
        }
    }
}

async fn handle_mining_commands(matches: &clap::ArgMatches) {
    match matches.subcommand() {
        Some(("start", start_matches)) => {
            let address = start_matches.get_one::<String>("address").unwrap();
            let threads: usize = start_matches
                .get_one::<String>("threads")
                .unwrap()
                .parse()
                .unwrap_or(1);
            let data_dir = start_matches.get_one::<String>("data-dir").unwrap();
            let db_path = format!("{}/blockchain.db", data_dir);

            match load_blockchain(&db_path) {
                Ok(mut blockchain) => {
                    let config = MiningConfig {
                        max_threads: threads,
                        target_difficulty: blockchain.get_difficulty(),
                        miner_address: address.clone(),
                        extra_nonce: 0,
                    };

                    let miner = Miner::new(config);
                    println!("{}", "Starting mining...".green());
                    println!("Miner address: {}", address.cyan());
                    println!("Threads: {}", threads.to_string().cyan());
                    println!("Current difficulty: {}", blockchain.get_difficulty().to_string().cyan());

                    // Get transactions from mempool
                    let transactions = blockchain.get_transactions_for_mining(950_000, 1000);
                    println!("Mining {} transactions", transactions.len().to_string().cyan());

                    let previous_hash = if let Some(latest_block) = blockchain.get_latest_block() {
                        blockchain.calculate_block_hash(latest_block)
                    } else {
                        "0".repeat(64)
                    };

                    match miner.mine_block(
                        transactions,
                        previous_hash,
                        blockchain.get_chain_height() + 1,
                        blockchain.get_difficulty(),
                    ) {
                        Ok(block) => {
                            println!("{}", "Block mined successfully!".green().bold());
                            println!("Block height: {}", block.header.height.to_string().cyan());
                            println!("Block hash: {}", blockchain.calculate_block_hash(&block).yellow());
                            println!("Nonce: {}", block.header.nonce.to_string().cyan());
                            println!("Transactions: {}", block.transactions.len().to_string().cyan());

                            match blockchain.add_block(block) {
                                Ok(_) => {
                                    println!("{}", "Block added to blockchain!".green());
                                }
                                Err(e) => {
                                    println!("{}", format!("Failed to add block: {}", e).red());
                                }
                            }
                        }
                        Err(e) => {
                            println!("{}", format!("Mining failed: {}", e).red());
                        }
                    }
                }
                Err(e) => {
                    println!("{}", format!("Failed to load blockchain: {}", e).red());
                }
            }
        }
        _ => {
            println!("{}", "Unknown mining command".red());
        }
    }
}

async fn handle_network_commands(matches: &clap::ArgMatches) {
    match matches.subcommand() {
        Some(("start", start_matches)) => {
            let port = start_matches.get_one::<String>("port").unwrap();
            let api_port = start_matches.get_one::<String>("api-port").unwrap();
            let data_dir = start_matches.get_one::<String>("data-dir").unwrap();
            let db_path = format!("{}/blockchain.db", data_dir);

            match load_blockchain(&db_path) {
                Ok(blockchain) => {
                    println!("{}", "Starting blockchain node...".green());
                    println!("P2P port: {}", port.cyan());
                    println!("API port: {}", api_port.cyan());
                    println!("Data directory: {}", data_dir.cyan());

                    // Start API server
                    let api_addr = format!("127.0.0.1:{}", api_port);
                    let api_handle = tokio::spawn(async move {
                        if let Err(e) = start_api_server(blockchain, &api_addr).await {
                            println!("{}", format!("API server error: {}", e).red());
                        }
                    });

                    // Start P2P network
                    match P2PNetwork::new().await {
                        Ok((mut network, mut handle)) => {
                            let p2p_addr: libp2p::Multiaddr = format!("/ip4/127.0.0.1/tcp/{}", port)
                                .parse()
                                .expect("Invalid multiaddr");

                            if let Err(e) = handle.start_listening(p2p_addr).await {
                                println!("{}", format!("Failed to start P2P listener: {}", e).red());
                                return;
                            }

                            println!("{}", "Node started successfully!".green().bold());
                            println!("Press Ctrl+C to stop the node");

                            // Run network
                            let network_handle = tokio::spawn(async move {
                                network.run().await;
                            });

                            // Wait for either task to complete
                            tokio::select! {
                                _ = api_handle => {
                                    println!("API server stopped");
                                }
                                _ = network_handle => {
                                    println!("P2P network stopped");
                                }
                                _ = tokio::signal::ctrl_c() => {
                                    println!("\nShutting down node...");
                                }
                            }
                        }
                        Err(e) => {
                            println!("{}", format!("Failed to create P2P network: {}", e).red());
                        }
                    }
                }
                Err(e) => {
                    println!("{}", format!("Failed to load blockchain: {}", e).red());
                }
            }
        }
        _ => {
            println!("{}", "Unknown network command".red());
        }
    }
}

async fn handle_contract_commands(matches: &clap::ArgMatches) {
    match matches.subcommand() {
        Some(("deploy", deploy_matches)) => {
            let code_file = deploy_matches.get_one::<String>("code").unwrap();
            let deployer = deploy_matches.get_one::<String>("deployer").unwrap();
            let gas_limit: u64 = deploy_matches
                .get_one::<String>("gas")
                .unwrap()
                .parse()
                .expect("Invalid gas limit");

            match std::fs::read(code_file) {
                Ok(code) => {
                    let mut vm = SmartContractVM::new().expect("Failed to create VM");
                    let deployment = rust_blockchain::smart_contracts::ContractDeployment {
                        code,
                        constructor_params: Vec::new(),
                        deployer: deployer.clone(),
                        gas_limit,
                        value: 0,
                    };

                    match vm.deploy_contract(deployment) {
                        Ok(address) => {
                            println!("{}", "Contract deployed successfully!".green());
                            println!("Contract address: {}", address.cyan());
                            println!("Deployer: {}", deployer.cyan());
                            println!("Gas limit: {}", gas_limit.to_string().cyan());
                        }
                        Err(e) => {
                            println!("{}", format!("Deployment failed: {}", e).red());
                        }
                    }
                }
                Err(e) => {
                    println!("{}", format!("Failed to read code file: {}", e).red());
                }
            }
        }
        Some(("call", call_matches)) => {
            let address = call_matches.get_one::<String>("address").unwrap();
            let function = call_matches.get_one::<String>("function").unwrap();
            let caller = call_matches.get_one::<String>("caller").unwrap();
            let gas_limit: u64 = call_matches
                .get_one::<String>("gas")
                .unwrap()
                .parse()
                .expect("Invalid gas limit");

            let mut vm = SmartContractVM::new().expect("Failed to create VM");
            let call = rust_blockchain::smart_contracts::ContractCall {
                contract_address: address.clone(),
                caller: caller.clone(),
                function_name: function.clone(),
                parameters: Vec::new(),
                gas_limit,
                value: 0,
            };

            match vm.call_contract(call) {
                Ok(result) => {
                    println!("{}", "Contract call completed!".green());
                    println!("Success: {}", result.success.to_string().cyan());
                    println!("Gas used: {}", result.gas_used.to_string().cyan());
                    
                    if let Some(error) = result.error {
                        println!("Error: {}", error.red());
                    }
                    
                    if !result.return_data.is_empty() {
                        println!("Return data: {}", hex::encode(&result.return_data).yellow());
                    }
                }
                Err(e) => {
                    println!("{}", format!("Contract call failed: {}", e).red());
                }
            }
        }
        _ => {
            println!("{}", "Unknown contract command".red());
        }
    }
}

fn load_blockchain(db_path: &str) -> Result<Blockchain, rust_blockchain::error::BlockchainError> {
    let config = BlockchainConfig::default();
    Blockchain::new(config, db_path)
}

fn format_amount(amount: Amount) -> String {
    let coins = amount / 100_000_000;
    let satoshis = amount % 100_000_000;
    format!("{}.{:08} BTC", coins, satoshis)
}

fn prompt_input(prompt: &str) -> String {
    print!("{}: ", prompt);
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}