use clap::{Args, Parser, Subcommand};
use colored::Colorize;
use rust_blockchain::{
    Amount,
    api::HEALTH_PATH,
    bip39_wallet::{BIP39Wallet, WordCount},
    blockchain::{Blockchain, BlockchainConfig},
    mining::{Miner, MiningConfig},
    node::{self, NodeOptions},
    smart_contracts::{ContractCall, ContractDeployment, ContractParameter, SmartContractVM},
    wallet::Wallet,
};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Duration;

/// Command line tool for the blockchain.
#[derive(Debug, Parser)]
#[command(name = "blockchain-cli", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Blockchain operations on a local data directory
    #[command(subcommand)]
    Blockchain(BlockchainCommand),
    /// Wallet operations
    #[command(subcommand)]
    Wallet(WalletCommand),
    /// Mining operations on a local data directory
    #[command(subcommand)]
    Mining(MiningCommand),
    /// Run a P2P node with the HTTP API
    #[command(subcommand)]
    Network(NetworkCommand),
    /// Smart contract operations (in-process VM)
    #[command(subcommand)]
    Contract(ContractCommand),
    /// Check that a node's HTTP API is healthy (exit code 0 when healthy)
    Health {
        /// API address as host:port
        #[arg(long, default_value = "127.0.0.1:8080")]
        addr: String,
    },
}

#[derive(Debug, Args)]
struct ChainArgs {
    /// Data directory path
    #[arg(short = 'd', long, value_name = "DIR")]
    data_dir: PathBuf,

    /// Chain difficulty in leading zero bits used for a new chain
    #[arg(long, value_name = "BITS")]
    difficulty: Option<u32>,
}

impl ChainArgs {
    fn open(&self, network: Option<&str>) -> rust_blockchain::Result<Blockchain> {
        std::fs::create_dir_all(&self.data_dir)?;
        let mut config = BlockchainConfig::default();
        if let Some(network) = network {
            config.network = network.to_string();
        }
        if let Some(bits) = self.difficulty {
            config.genesis_difficulty = bits;
        }
        Blockchain::new(config, self.data_dir.join("blockchain.db"))
    }
}

#[derive(Debug, Subcommand)]
enum BlockchainCommand {
    /// Initialize a new blockchain
    Init {
        #[command(flatten)]
        chain: ChainArgs,
        /// Network name
        #[arg(short = 'n', long, default_value = "testnet")]
        network: String,
    },
    /// Show blockchain information
    Info {
        #[command(flatten)]
        chain: ChainArgs,
    },
    /// List recent blocks
    Blocks {
        #[command(flatten)]
        chain: ChainArgs,
        /// Number of blocks to show
        #[arg(short = 'c', long, default_value_t = 10)]
        count: u64,
    },
}

#[derive(Debug, Subcommand)]
enum WalletCommand {
    /// Create a new BIP39 wallet and save it to <name>.wallet
    Create {
        #[arg(short = 'n', long)]
        name: String,
        /// Number of mnemonic words (12 or 24)
        #[arg(short = 'w', long, default_value_t = 12)]
        words: u32,
        /// Output file (defaults to <name>.wallet)
        #[arg(short = 'o', long)]
        output: Option<PathBuf>,
    },
    /// Restore a wallet from a mnemonic phrase
    Restore {
        #[arg(short = 'n', long)]
        name: String,
        #[arg(short = 'm', long)]
        mnemonic: String,
        /// Optional BIP39 passphrase
        #[arg(short = 'p', long, default_value = "")]
        passphrase: String,
        /// Output file (defaults to <name>.wallet)
        #[arg(short = 'o', long)]
        output: Option<PathBuf>,
    },
    /// Show the addresses stored in a wallet file
    Addresses {
        #[arg(short = 'w', long)]
        wallet: PathBuf,
    },
    /// Check wallet balance against a local data directory
    Balance {
        #[arg(short = 'w', long)]
        wallet: PathBuf,
        #[command(flatten)]
        chain: ChainArgs,
    },
    /// Create and sign a transaction; submit it to a node or print it as JSON
    Send {
        #[arg(short = 'w', long)]
        wallet: PathBuf,
        /// Recipient address
        #[arg(short = 't', long)]
        to: String,
        /// Amount in base units
        #[arg(short = 'a', long)]
        amount: Amount,
        /// Fee in base units
        #[arg(short = 'f', long, default_value_t = 1000)]
        fee: Amount,
        #[command(flatten)]
        chain: ChainArgs,
        /// Node API (host:port) to submit the transaction to
        #[arg(long)]
        node: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
enum MiningCommand {
    /// Mine blocks into a local data directory
    Start {
        /// Mining reward address
        #[arg(short = 'a', long)]
        address: String,
        /// Number of mining threads
        #[arg(short = 't', long, default_value_t = 1)]
        threads: usize,
        /// Number of blocks to mine
        #[arg(short = 'b', long, default_value_t = 1)]
        blocks: u64,
        #[command(flatten)]
        chain: ChainArgs,
    },
}

#[derive(Debug, Subcommand)]
enum NetworkCommand {
    /// Start a P2P node with the HTTP API
    Start {
        /// P2P port
        #[arg(short = 'p', long, default_value_t = 8333)]
        port: u16,
        /// API server port
        #[arg(long, default_value_t = 8080)]
        api_port: u16,
        /// API server host
        #[arg(long, default_value = "127.0.0.1")]
        api_host: String,
        /// Bootstrap peer multiaddress (repeatable)
        #[arg(short = 'b', long = "bootstrap")]
        bootstrap: Vec<String>,
        #[command(flatten)]
        chain: ChainArgs,
    },
}

#[derive(Debug, Subcommand)]
enum ContractCommand {
    /// Compile and deploy a contract, reporting its address and gas
    Deploy {
        /// Contract code file (.wasm or .wat)
        #[arg(short = 'c', long)]
        code: PathBuf,
        /// Deployer address
        #[arg(short = 'd', long)]
        deployer: String,
        /// Gas limit
        #[arg(short = 'g', long, default_value_t = 1_000_000)]
        gas: u64,
    },
    /// Deploy a contract and call one of its functions in a fresh VM
    Call {
        /// Contract code file (.wasm or .wat)
        #[arg(long)]
        code: PathBuf,
        /// Function name
        #[arg(short = 'f', long)]
        function: String,
        /// Caller address
        #[arg(short = 'c', long)]
        caller: String,
        /// Gas limit
        #[arg(short = 'g', long, default_value_t = 100_000)]
        gas: u64,
        /// Integer arguments passed to the function
        #[arg(long = "arg")]
        args: Vec<u64>,
    },
}

fn main() -> ExitCode {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();
    let cli = Cli::parse();

    let result = match cli.command {
        Command::Blockchain(cmd) => blockchain_command(cmd),
        Command::Wallet(cmd) => wallet_command(cmd),
        Command::Mining(cmd) => mining_command(cmd),
        Command::Network(cmd) => network_command(cmd),
        Command::Contract(cmd) => contract_command(cmd),
        Command::Health { addr } => health_command(&addr),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{}", format!("Error: {e}").red());
            ExitCode::FAILURE
        }
    }
}

type CliResult = Result<(), Box<dyn std::error::Error>>;

fn blockchain_command(cmd: BlockchainCommand) -> CliResult {
    match cmd {
        BlockchainCommand::Init { chain, network } => {
            let blockchain = chain.open(Some(&network))?;
            println!("{}", "Blockchain initialized".green());
            println!("Network: {}", network.cyan());
            println!(
                "Data directory: {}",
                chain.data_dir.display().to_string().cyan()
            );
            println!("Genesis: {}", blockchain.get_best_block_hash().yellow());
        }
        BlockchainCommand::Info { chain } => {
            let stats = chain.open(None)?.get_chain_stats();
            println!("{}", "Blockchain Information".bold().green());
            println!("Height: {}", stats.height.to_string().cyan());
            println!("Best block: {}", stats.best_block_hash.yellow());
            println!("Difficulty: {}", stats.difficulty.to_string().cyan());
            println!(
                "Next difficulty: {}",
                stats.next_difficulty.to_string().cyan()
            );
            println!(
                "Total transactions: {}",
                stats.total_transactions.to_string().cyan()
            );
            println!("Total supply: {}", format_amount(stats.total_supply).cyan());
            println!("UTXO count: {}", stats.utxo_count.to_string().cyan());
        }
        BlockchainCommand::Blocks { chain, count } => {
            let blockchain = chain.open(None)?;
            println!("{}", "Recent Blocks".bold().green());
            let tip = blockchain.get_chain_height();
            for height in (0..=tip).rev().take(count as usize) {
                if let Some(block) = blockchain.get_block_by_height(height) {
                    println!(
                        "Block #{}: {} ({} txs)",
                        height.to_string().cyan(),
                        block.hash()[..16].yellow(),
                        block.transactions.len().to_string().magenta()
                    );
                }
            }
        }
    }
    Ok(())
}

fn save_wallet(wallet: &BIP39Wallet, output: Option<PathBuf>) -> rust_blockchain::Result<PathBuf> {
    let path = output.unwrap_or_else(|| PathBuf::from(format!("{}.wallet", wallet.wallet.name)));
    wallet.wallet.save_to_file(&path)?;
    Ok(path)
}

fn wallet_command(cmd: WalletCommand) -> CliResult {
    match cmd {
        WalletCommand::Create {
            name,
            words,
            output,
        } => {
            let word_count = match words {
                12 => WordCount::Words12,
                24 => WordCount::Words24,
                other => {
                    return Err(format!("unsupported word count {other} (use 12 or 24)").into());
                }
            };
            let wallet = BIP39Wallet::new(name.clone(), word_count)?;
            let path = save_wallet(&wallet, output)?;

            println!("{}", "Wallet created".green());
            println!("Name: {}", name.cyan());
            println!("File: {}", path.display().to_string().cyan());
            if let Some(mnemonic) = wallet.get_mnemonic() {
                println!(
                    "{}",
                    "Write down your mnemonic phrase and keep it safe:"
                        .yellow()
                        .bold()
                );
                println!("{}", mnemonic.red().bold());
            }
            println!("First address: {}", wallet.wallet.addresses[0].cyan());
        }
        WalletCommand::Restore {
            name,
            mnemonic,
            passphrase,
            output,
        } => {
            let wallet = BIP39Wallet::from_mnemonic(name.clone(), &mnemonic, &passphrase)?;
            let path = save_wallet(&wallet, output)?;
            println!("{}", "Wallet restored".green());
            println!("File: {}", path.display().to_string().cyan());
            println!("First address: {}", wallet.wallet.addresses[0].cyan());
        }
        WalletCommand::Addresses { wallet } => {
            let wallet = Wallet::load_from_file(&wallet)?;
            for address in &wallet.addresses {
                println!("{address}");
            }
        }
        WalletCommand::Balance { wallet, chain } => {
            let wallet = Wallet::load_from_file(&wallet)?;
            let blockchain = chain.open(None)?;
            println!("{}", "Wallet Balance".bold().green());
            println!("Wallet: {}", wallet.name.cyan());
            println!(
                "Balance: {}",
                format_amount(wallet.get_balance(blockchain.get_utxo_set())).cyan()
            );
            println!("Addresses: {}", wallet.addresses.len().to_string().cyan());
        }
        WalletCommand::Send {
            wallet,
            to,
            amount,
            fee,
            chain,
            node,
        } => {
            let wallet = Wallet::load_from_file(&wallet)?;
            let blockchain = chain.open(None)?;
            let transaction = wallet.create_transaction(
                to.clone(),
                amount,
                fee,
                blockchain.get_utxo_set(),
                blockchain.get_chain_height(),
            )?;
            let body = serde_json::to_string(&transaction)?;

            match node {
                Some(addr) => {
                    let (status, response) =
                        http_request(&addr, "POST", "/api/v1/transaction", Some(&body))?;
                    if !(200..300).contains(&status) {
                        return Err(
                            format!("node rejected transaction ({status}): {response}").into()
                        );
                    }
                    println!("{}", "Transaction submitted".green());
                    println!("Transaction ID: {}", transaction.id.cyan());
                    println!("To: {}", to.cyan());
                    println!("Amount: {}", format_amount(amount).cyan());
                    println!("Fee: {}", format_amount(fee).cyan());
                }
                None => println!("{body}"),
            }
        }
    }
    Ok(())
}

fn mining_command(cmd: MiningCommand) -> CliResult {
    let MiningCommand::Start {
        address,
        threads,
        blocks,
        chain,
    } = cmd;

    let mut blockchain = chain.open(None)?;
    let miner = Miner::new(MiningConfig {
        max_threads: threads.max(1),
        target_difficulty: blockchain.calculate_next_difficulty(),
        miner_address: address.clone(),
        extra_nonce: 0,
    });

    println!("{}", "Starting mining".green());
    println!("Miner address: {}", address.cyan());
    for _ in 0..blocks {
        let template = blockchain.block_template(950_000, 1000);
        let block = miner.mine_block(
            template.transactions,
            template.previous_hash,
            template.height,
            template.difficulty,
        )?;
        println!(
            "Mined block #{} {} (nonce {}, {} txs)",
            block.header.height.to_string().cyan(),
            block.hash().yellow(),
            block.header.nonce,
            block.transactions.len()
        );
        blockchain.add_block(block)?;
    }
    println!(
        "Balance of {}: {}",
        address,
        format_amount(blockchain.get_balance(&address)).cyan()
    );
    Ok(())
}

fn network_command(cmd: NetworkCommand) -> CliResult {
    let NetworkCommand::Start {
        port,
        api_port,
        api_host,
        bootstrap,
        chain,
    } = cmd;

    let options = NodeOptions {
        data_dir: chain.data_dir,
        difficulty: chain.difficulty,
        p2p_port: port,
        api_port,
        api_host,
        bootstrap,
        ..Default::default()
    };

    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(node::run(options))?;
    Ok(())
}

fn read_code(path: &Path) -> std::io::Result<Vec<u8>> {
    std::fs::read(path)
}

fn contract_command(cmd: ContractCommand) -> CliResult {
    let mut vm = SmartContractVM::new()?;
    match cmd {
        ContractCommand::Deploy {
            code,
            deployer,
            gas,
        } => {
            let address = vm.deploy_contract(ContractDeployment {
                code: read_code(&code)?,
                constructor_params: Vec::new(),
                deployer: deployer.clone(),
                gas_limit: gas,
                value: 0,
            })?;
            let contract = vm
                .get_contract(&address)
                .ok_or("contract missing after deploy")?;
            println!("{}", "Contract deployed".green());
            println!("Contract address: {}", address.cyan());
            println!("Deployer: {}", deployer.cyan());
            println!("Gas used: {}", contract.gas_used.to_string().cyan());
        }
        ContractCommand::Call {
            code,
            function,
            caller,
            gas,
            args,
        } => {
            let address = vm.deploy_contract(ContractDeployment {
                code: read_code(&code)?,
                constructor_params: Vec::new(),
                deployer: caller.clone(),
                gas_limit: gas.max(100_000),
                value: 0,
            })?;
            let result = vm.call_contract(ContractCall {
                contract_address: address,
                caller,
                function_name: function,
                parameters: args.into_iter().map(ContractParameter::U64).collect(),
                gas_limit: gas,
                value: 0,
            })?;

            println!("Success: {}", result.success.to_string().cyan());
            println!("Gas used: {}", result.gas_used.to_string().cyan());
            if let Some(error) = result.error {
                println!("Error: {}", error.red());
            }
            if !result.return_data.is_empty() {
                println!("Return data: {}", hex::encode(&result.return_data).yellow());
            }
        }
    }
    Ok(())
}

fn health_command(addr: &str) -> CliResult {
    let (status, body) = http_request(addr, "GET", HEALTH_PATH, None)?;
    if status == 200 && body.contains("\"healthy\"") {
        println!("healthy");
        Ok(())
    } else {
        Err(format!("unhealthy ({status}): {body}").into())
    }
}

/// Minimal HTTP/1.1 client (no TLS) used for the health check and for
/// submitting transactions, so the runtime image does not need curl.
fn http_request(
    addr: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<(u16, String), Box<dyn std::error::Error>> {
    let socket = addr
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| format!("cannot resolve {addr}"))?;
    let timeout = Duration::from_secs(5);
    let mut stream = TcpStream::connect_timeout(&socket, timeout)?;
    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(timeout))?;

    let body = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes())?;

    let mut response = String::new();
    stream.read_to_string(&mut response)?;

    let status = response
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or("malformed HTTP response")?;
    let body = response
        .split_once("\r\n\r\n")
        .map(|(_, body)| body.to_string())
        .unwrap_or_default();
    Ok((status, body))
}

fn format_amount(amount: Amount) -> String {
    format!("{}.{:08}", amount / 100_000_000, amount % 100_000_000)
}
