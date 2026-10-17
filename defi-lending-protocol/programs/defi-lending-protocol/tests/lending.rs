//! End-to-end tests against the compiled SBF program running in LiteSVM.
//! Build the program first: `anchor build` (or `cargo build-sbf`).

use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::{AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas};
use anchor_spl::token::spl_token;
use defi_lending_protocol::constants::*;
use defi_lending_protocol::instructions::CreateMarketParams;
use defi_lending_protocol::state::{Market, MarketConfig, Position, RateModel};
use defi_lending_protocol::{accounts, instruction};
use litesvm::LiteSVM;
use pyth_solana_receiver_sdk::price_update::{PriceFeedMessage, PriceUpdateV2, VerificationLevel};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const SOL_FEED: [u8; 32] = [1; 32];
const USDC_FEED: [u8; 32] = [2; 32];
const START_TS: i64 = 1_800_000_000;

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    protocol: Pubkey,
    collateral_mint: Pubkey,
    loan_mint: Pubkey,
    market: Pubkey,
    collateral_vault: Pubkey,
    loan_vault: Pubkey,
    share_mint: Pubkey,
    collateral_price: Pubkey,
    loan_price: Pubkey,
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &defi_lending_protocol::ID).0
}

fn set_mint(svm: &mut LiteSVM, address: Pubkey, decimals: u8) {
    let mut data = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint {
        mint_authority: COption::None,
        supply: u64::MAX / 2,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    }
    .pack_into_slice(&mut data);
    put(svm, address, spl_token::ID, data);
}

fn set_token_account(svm: &mut LiteSVM, mint: Pubkey, owner: Pubkey, amount: u64) -> Pubkey {
    let address = Pubkey::new_unique();
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    }
    .pack_into_slice(&mut data);
    put(svm, address, spl_token::ID, data);
    address
}

fn set_price(svm: &mut LiteSVM, address: Pubkey, feed_id: [u8; 32], price: i64, publish_time: i64) {
    let update = PriceUpdateV2 {
        write_authority: Pubkey::new_unique(),
        verification_level: VerificationLevel::Full,
        price_message: PriceFeedMessage {
            feed_id,
            price,
            conf: (price / 1_000) as u64,
            exponent: -8,
            publish_time,
            prev_publish_time: publish_time - 1,
            ema_price: price,
            ema_conf: 0,
        },
        posted_slot: 1,
    };
    let mut data = Vec::with_capacity(PriceUpdateV2::LEN);
    update.try_serialize(&mut data).unwrap();
    data.resize(PriceUpdateV2::LEN, 0);
    put(svm, address, pyth_solana_receiver_sdk::ID, data);
}

fn put(svm: &mut LiteSVM, address: Pubkey, owner: Pubkey, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        address,
        Account {
            lamports,
            data,
            owner,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn balance(svm: &LiteSVM, token_account: Pubkey) -> u64 {
    let acc = svm.get_account(&token_account).unwrap();
    spl_token::state::Account::unpack(&acc.data).unwrap().amount
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, address: Pubkey) -> T {
    let acc = svm.get_account(&address).unwrap();
    T::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn warp(svm: &mut LiteSVM, ts: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = ts;
    clock.slot += 1;
    svm.set_sysvar(&clock);
    svm.expire_blockhash();
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    let payer = signers[0].pubkey();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer), signers, svm.latest_blockhash());
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
}

fn expect_error(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], code: &str) {
    match send(svm, ixs, signers) {
        Ok(()) => panic!("expected {code}, but the transaction succeeded"),
        Err(logs) => assert!(logs.contains(code), "expected {code}, got logs:\n{logs}"),
    }
}

fn ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: defi_lending_protocol::ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

fn config() -> MarketConfig {
    MarketConfig {
        ltv_bps: 7_500,
        liquidation_threshold_bps: 8_000,
        liquidation_bonus_bps: 500,
        reserve_factor_bps: 1_000,
        flash_loan_fee_bps: 9,
        max_price_age_secs: 60,
        rate_model: RateModel {
            base_rate_bps: 200,
            slope1_bps: 400,
            slope2_bps: 6_000,
            optimal_utilization_bps: 8_000,
        },
    }
}

fn setup() -> Env {
    let so = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/deploy/defi_lending_protocol.so");
    assert!(
        so.exists(),
        "missing {}; run `anchor build` first",
        so.display()
    );

    let mut svm = LiteSVM::new();
    svm.add_program_from_file(defi_lending_protocol::ID, &so)
        .unwrap();
    warp(&mut svm, START_TS);

    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();

    let collateral_mint = Pubkey::new_unique();
    let loan_mint = Pubkey::new_unique();
    set_mint(&mut svm, collateral_mint, 9);
    set_mint(&mut svm, loan_mint, 6);

    let collateral_price = Pubkey::new_unique();
    let loan_price = Pubkey::new_unique();
    set_price(&mut svm, collateral_price, SOL_FEED, 150_00000000, START_TS);
    set_price(&mut svm, loan_price, USDC_FEED, 1_00000000, START_TS);

    let protocol = pda(&[PROTOCOL_SEED]);
    let market = pda(&[MARKET_SEED, collateral_mint.as_ref(), loan_mint.as_ref()]);
    let collateral_vault = pda(&[COLLATERAL_VAULT_SEED, market.as_ref()]);
    let loan_vault = pda(&[LOAN_VAULT_SEED, market.as_ref()]);
    let share_mint = pda(&[SHARE_MINT_SEED, market.as_ref()]);

    let init = ix(
        accounts::InitializeProtocol {
            admin: admin.pubkey(),
            protocol,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::InitializeProtocol {},
    );
    let create = ix(
        accounts::CreateMarket {
            admin: admin.pubkey(),
            protocol,
            collateral_mint,
            loan_mint,
            market,
            collateral_vault,
            loan_vault,
            share_mint,
            token_program: spl_token::ID,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::CreateMarket {
            params: CreateMarketParams {
                collateral_feed_id: SOL_FEED,
                loan_feed_id: USDC_FEED,
                config: config(),
            },
        },
    );
    send(&mut svm, &[init, create], &[&admin]).unwrap();

    Env {
        svm,
        admin,
        protocol,
        collateral_mint,
        loan_mint,
        market,
        collateral_vault,
        loan_vault,
        share_mint,
        collateral_price,
        loan_price,
    }
}

struct User {
    kp: Keypair,
    loan: Pubkey,
    shares: Pubkey,
    collateral: Pubkey,
    position: Pubkey,
}

impl Env {
    fn user(&mut self, loan: u64, collateral: u64) -> User {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
        let owner = kp.pubkey();
        User {
            loan: set_token_account(&mut self.svm, self.loan_mint, owner, loan),
            shares: set_token_account(&mut self.svm, self.share_mint, owner, 0),
            collateral: set_token_account(&mut self.svm, self.collateral_mint, owner, collateral),
            position: pda(&[POSITION_SEED, self.market.as_ref(), owner.as_ref()]),
            kp,
        }
    }

    fn supply_accounts(&self, u: &User) -> accounts::SupplyLiquidity {
        accounts::SupplyLiquidity {
            user: u.kp.pubkey(),
            protocol: self.protocol,
            market: self.market,
            loan_mint: self.loan_mint,
            loan_vault: self.loan_vault,
            share_mint: self.share_mint,
            user_loan_account: u.loan,
            user_share_account: u.shares,
            token_program: spl_token::ID,
        }
    }

    fn supply(&mut self, u: &User, amount: u64) {
        let i = ix(self.supply_accounts(u), instruction::Supply { amount });
        send(&mut self.svm, &[i], &[&u.kp]).unwrap();
    }

    fn open_and_deposit(&mut self, u: &User, amount: u64) {
        let open = ix(
            accounts::OpenPosition {
                owner: u.kp.pubkey(),
                market: self.market,
                position: u.position,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::OpenPosition {},
        );
        let deposit = ix(
            accounts::DepositCollateral {
                owner: u.kp.pubkey(),
                protocol: self.protocol,
                market: self.market,
                position: u.position,
                collateral_mint: self.collateral_mint,
                collateral_vault: self.collateral_vault,
                owner_collateral_account: u.collateral,
                token_program: spl_token::ID,
            },
            instruction::DepositCollateral { amount },
        );
        send(&mut self.svm, &[open, deposit], &[&u.kp]).unwrap();
    }

    fn borrow_ix(&self, u: &User, amount: u64) -> Instruction {
        ix(
            accounts::Borrow {
                owner: u.kp.pubkey(),
                protocol: self.protocol,
                market: self.market,
                position: u.position,
                loan_mint: self.loan_mint,
                loan_vault: self.loan_vault,
                destination: u.loan,
                collateral_price: self.collateral_price,
                loan_price: self.loan_price,
                token_program: spl_token::ID,
            },
            instruction::Borrow { amount },
        )
    }

    fn repay_ix(&self, payer: &User, position: Pubkey, amount: u64) -> Instruction {
        ix(
            accounts::Repay {
                payer: payer.kp.pubkey(),
                protocol: self.protocol,
                market: self.market,
                position,
                loan_mint: self.loan_mint,
                loan_vault: self.loan_vault,
                payer_loan_account: payer.loan,
                token_program: spl_token::ID,
            },
            instruction::Repay { amount },
        )
    }

    fn withdraw_collateral_ix(&self, u: &User, amount: u64) -> Instruction {
        ix(
            accounts::WithdrawCollateral {
                owner: u.kp.pubkey(),
                protocol: self.protocol,
                market: self.market,
                position: u.position,
                collateral_mint: self.collateral_mint,
                collateral_vault: self.collateral_vault,
                destination: u.collateral,
                collateral_price: self.collateral_price,
                loan_price: self.loan_price,
                token_program: spl_token::ID,
            },
            instruction::WithdrawCollateral { amount },
        )
    }

    fn flash_accounts(&self, u: &User) -> accounts::FlashLoanAccounts {
        accounts::FlashLoanAccounts {
            user: u.kp.pubkey(),
            protocol: self.protocol,
            market: self.market,
            loan_mint: self.loan_mint,
            loan_vault: self.loan_vault,
            user_loan_account: u.loan,
            instructions: anchor_lang::compat::solana_instructions_sysvar::ID,
            token_program: spl_token::ID,
        }
    }

    fn refresh_prices(&mut self, sol_price: i64, ts: i64) {
        set_price(
            &mut self.svm,
            self.collateral_price,
            SOL_FEED,
            sol_price,
            ts,
        );
        set_price(&mut self.svm, self.loan_price, USDC_FEED, 1_00000000, ts);
    }
}

const USDC: u64 = 1_000_000;
const SOL: u64 = 1_000_000_000;

#[test]
fn supply_borrow_accrue_repay_withdraw() {
    let mut env = setup();
    let lender = env.user(10_000 * USDC, 0);
    let borrower = env.user(0, 10 * SOL);

    env.supply(&lender, 5_000 * USDC);
    assert_eq!(balance(&env.svm, lender.shares), 5_000 * USDC);

    // 10 SOL @ $150 = $1,500 collateral; 75% LTV caps debt at $1,125.
    env.open_and_deposit(&borrower, 10 * SOL);
    let too_much = env.borrow_ix(&borrower, 1_126 * USDC);
    expect_error(&mut env.svm, &[too_much], &[&borrower.kp], "LtvExceeded");
    let ok = env.borrow_ix(&borrower, 1_000 * USDC);
    send(&mut env.svm, &[ok], &[&borrower.kp]).unwrap();
    assert_eq!(balance(&env.svm, borrower.loan), 1_000 * USDC);

    // Cannot pull collateral that backs the loan.
    let pull = env.withdraw_collateral_ix(&borrower, 5 * SOL);
    expect_error(&mut env.svm, &[pull], &[&borrower.kp], "LtvExceeded");

    // One year later, with fresh oracle prices, interest has accrued.
    let later = START_TS + SECONDS_PER_YEAR as i64;
    warp(&mut env.svm, later);
    env.refresh_prices(150_00000000, later);
    let poke = env.repay_ix(&borrower, borrower.position, 1);
    set_token_account_balance(
        &mut env.svm,
        borrower.loan,
        env.loan_mint,
        borrower.kp.pubkey(),
        2_000 * USDC,
    );
    send(&mut env.svm, &[poke], &[&borrower.kp]).unwrap();
    let market: Market = read(&env.svm, env.market);
    let position: Position = read(&env.svm, borrower.position);
    let debt = position.debt(&market).unwrap();
    assert!(
        debt > 1_000 * USDC,
        "debt should include interest, got {debt}"
    );
    assert!(market.total_reserves > 0);

    // Repay everything and take the collateral back.
    let repay_all = env.repay_ix(&borrower, borrower.position, u64::MAX);
    let withdraw = env.withdraw_collateral_ix(&borrower, 10 * SOL);
    send(&mut env.svm, &[repay_all, withdraw], &[&borrower.kp]).unwrap();
    assert_eq!(balance(&env.svm, borrower.collateral), 10 * SOL);
    let position: Position = read(&env.svm, borrower.position);
    assert_eq!(position.borrow_scaled, 0);

    // The lender redeems all shares for more than was deposited.
    let withdraw = ix(
        env.supply_accounts(&lender),
        instruction::Withdraw {
            shares: 5_000 * USDC,
        },
    );
    send(&mut env.svm, &[withdraw], &[&lender.kp]).unwrap();
    let received = balance(&env.svm, lender.loan);
    assert!(
        received > 10_000 * USDC,
        "lender should earn interest, got {received}"
    );
}

fn set_token_account_balance(
    svm: &mut LiteSVM,
    address: Pubkey,
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
) {
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    }
    .pack_into_slice(&mut data);
    put(svm, address, spl_token::ID, data);
}

#[test]
fn liquidation_after_price_drop() {
    let mut env = setup();
    let lender = env.user(10_000 * USDC, 0);
    let borrower = env.user(0, 10 * SOL);
    let liquidator = env.user(5_000 * USDC, 0);

    env.supply(&lender, 5_000 * USDC);
    env.open_and_deposit(&borrower, 10 * SOL);
    let b = env.borrow_ix(&borrower, 1_000 * USDC);
    send(&mut env.svm, &[b], &[&borrower.kp]).unwrap();

    let liquidate = |env: &Env| {
        ix(
            accounts::Liquidate {
                liquidator: liquidator.kp.pubkey(),
                protocol: env.protocol,
                market: env.market,
                position: borrower.position,
                collateral_mint: env.collateral_mint,
                loan_mint: env.loan_mint,
                collateral_vault: env.collateral_vault,
                loan_vault: env.loan_vault,
                liquidator_loan_account: liquidator.loan,
                liquidator_collateral_account: liquidator.collateral,
                collateral_price: env.collateral_price,
                loan_price: env.loan_price,
                token_program: spl_token::ID,
            },
            instruction::Liquidate {
                max_repay: u64::MAX,
            },
        )
    };

    // Healthy at $150: liquidation is rejected.
    let l = liquidate(&env);
    expect_error(&mut env.svm, &[l], &[&liquidator.kp], "PositionHealthy");

    // SOL drops to $120: $1,200 collateral vs $1,000 debt > 80% threshold.
    warp(&mut env.svm, START_TS + 10);
    env.refresh_prices(120_00000000, START_TS + 10);
    let l = liquidate(&env);
    send(&mut env.svm, &[l], &[&liquidator.kp]).unwrap();

    // Close factor: at most half the debt is repaid; 5% bonus on seized collateral.
    let repaid = 5_000 * USDC - balance(&env.svm, liquidator.loan);
    let seized = balance(&env.svm, liquidator.collateral);
    assert!(
        (499 * USDC..=500 * USDC + 100).contains(&repaid),
        "repaid {repaid}"
    );
    let expected_seize = (repaid as u128 * 105 / 100 * 1_000 / 120) as u64; // USDC(6) -> SOL(9) at $120
    assert!(
        seized.abs_diff(expected_seize) <= 10,
        "seized {seized}, expected ~{expected_seize}"
    );
    let position: Position = read(&env.svm, borrower.position);
    assert_eq!(position.collateral_amount, 10 * SOL - seized);
}

#[test]
fn stale_or_wrong_oracle_is_rejected() {
    let mut env = setup();
    let lender = env.user(10_000 * USDC, 0);
    let borrower = env.user(0, 10 * SOL);
    env.supply(&lender, 5_000 * USDC);
    env.open_and_deposit(&borrower, 10 * SOL);

    // Price older than max_price_age_secs (60s).
    warp(&mut env.svm, START_TS + 120);
    let b = env.borrow_ix(&borrower, 10 * USDC);
    expect_error(&mut env.svm, &[b], &[&borrower.kp], "InvalidOraclePrice");

    // Fresh price but for the wrong feed id.
    env.svm.expire_blockhash();
    set_price(
        &mut env.svm,
        env.collateral_price,
        [9; 32],
        150_00000000,
        START_TS + 120,
    );
    set_price(
        &mut env.svm,
        env.loan_price,
        USDC_FEED,
        1_00000000,
        START_TS + 120,
    );
    let b = env.borrow_ix(&borrower, 10 * USDC);
    expect_error(&mut env.svm, &[b], &[&borrower.kp], "InvalidOraclePrice");
}

#[test]
fn flash_loan_requires_repayment_in_same_transaction() {
    let mut env = setup();
    let lender = env.user(10_000 * USDC, 0);
    let trader = env.user(10 * USDC, 0);
    env.supply(&lender, 5_000 * USDC);

    let amount = 1_000 * USDC;
    let borrow = ix(
        env.flash_accounts(&trader),
        instruction::FlashBorrow { amount },
    );
    expect_error(
        &mut env.svm,
        std::slice::from_ref(&borrow),
        &[&trader.kp],
        "FlashRepayMissing",
    );

    let repay = ix(
        env.flash_accounts(&trader),
        instruction::FlashRepay { amount },
    );
    send(&mut env.svm, &[borrow, repay], &[&trader.kp]).unwrap();

    let fee = 900_000; // 0.09% of 1,000 USDC
    assert_eq!(balance(&env.svm, trader.loan), 10 * USDC - fee);
    let market: Market = read(&env.svm, env.market);
    assert!(!market.flash_loan_active);
    assert_eq!(
        market.total_deposits + market.total_reserves,
        5_000 * USDC + fee
    );
}

#[test]
fn admin_controls_are_enforced() {
    let mut env = setup();
    let user = env.user(1_000 * USDC, 0);

    let pause = |signer: Pubkey, paused: bool, env: &Env| {
        ix(
            accounts::SetProtocolPaused {
                admin: signer,
                protocol: env.protocol,
            },
            instruction::SetProtocolPaused { paused },
        )
    };
    let not_admin = pause(user.kp.pubkey(), true, &env);
    expect_error(&mut env.svm, &[not_admin], &[&user.kp], "ConstraintHasOne");

    let admin_key = env.admin.pubkey();
    let p = pause(admin_key, true, &env);
    let admin = env.admin.insecure_clone();
    send(&mut env.svm, &[p], &[&admin]).unwrap();
    let s = ix(
        env.supply_accounts(&user),
        instruction::Supply { amount: USDC },
    );
    expect_error(&mut env.svm, &[s], &[&user.kp], "Paused");
}
