//! End-to-end auction flows against the compiled SBF program in LiteSVM.
//! Build the programs first: `anchor build`.

use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::token::spl_token;
use auction_system::{AUCTION_SEED, Auction, accounts, instruction};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const SOL: u64 = 1_000_000_000;
const NOW: i64 = 1_800_000_000;
const DURATION: i64 = 3_600;

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token::ID.as_ref(), mint.as_ref()],
        &anchor_spl::associated_token::ID,
    )
    .0
}

fn ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: auction_system::ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

fn put(svm: &mut LiteSVM, address: Pubkey, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        address,
        Account {
            lamports,
            data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn mint_nft(svm: &mut LiteSVM, owner: Pubkey) -> Pubkey {
    let mint = Pubkey::new_unique();
    let mut data = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint {
        mint_authority: COption::None,
        supply: 1,
        decimals: 0,
        is_initialized: true,
        freeze_authority: COption::None,
    }
    .pack_into_slice(&mut data);
    put(svm, mint, data);
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account {
        mint,
        owner,
        amount: 1,
        delegate: COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    }
    .pack_into_slice(&mut data);
    put(svm, ata(&owner, &mint), data);
    mint
}

fn token_balance(svm: &LiteSVM, address: Pubkey) -> Option<u64> {
    svm.get_account(&address)
        .filter(|a| a.owner == spl_token::ID && !a.data.is_empty())
        .map(|a| spl_token::state::Account::unpack(&a.data).unwrap().amount)
}

fn lamports(svm: &LiteSVM, address: Pubkey) -> u64 {
    svm.get_account(&address).map(|a| a.lamports).unwrap_or(0)
}

fn warp(svm: &mut LiteSVM, ts: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = ts;
    clock.slot += 1;
    svm.set_sysvar(&clock);
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&signers[0].pubkey()),
        signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
}

fn expect_error(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], code: &str) {
    match send(svm, ixs, signers) {
        Ok(()) => panic!("expected {code}, but the transaction succeeded"),
        Err(logs) => assert!(logs.contains(code), "expected {code}, got:\n{logs}"),
    }
}

struct Env {
    svm: LiteSVM,
    seller: Keypair,
    mint: Pubkey,
    auction: Pubkey,
}

fn setup() -> Env {
    let so = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/deploy/auction_system.so");
    assert!(
        so.exists(),
        "missing {}; run `anchor build` first",
        so.display()
    );
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(auction_system::ID, &so).unwrap();
    warp(&mut svm, NOW);

    let seller = Keypair::new();
    svm.airdrop(&seller.pubkey(), 5 * SOL).unwrap();
    let mint = mint_nft(&mut svm, seller.pubkey());
    let auction =
        Pubkey::find_program_address(&[AUCTION_SEED, mint.as_ref()], &auction_system::ID).0;
    let create = ix(
        accounts::CreateAuction {
            seller: seller.pubkey(),
            mint,
            seller_token_account: ata(&seller.pubkey(), &mint),
            auction,
            vault: ata(&auction, &mint),
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::CreateAuction {
            min_bid: SOL,
            min_increment_bps: 500,
            duration_secs: DURATION,
        },
    );
    send(&mut svm, &[create], &[&seller]).unwrap();
    Env {
        svm,
        seller,
        mint,
        auction,
    }
}

impl Env {
    fn bidder(&mut self) -> Keypair {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), 20 * SOL).unwrap();
        kp
    }

    fn bid_ix(&self, bidder: &Keypair, previous: Pubkey, amount: u64) -> Instruction {
        ix(
            accounts::PlaceBid {
                bidder: bidder.pubkey(),
                auction: self.auction,
                previous_bidder: previous,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::PlaceBid { amount },
        )
    }

    fn settle_ix(&self, payer: &Keypair, receiver: Pubkey) -> Instruction {
        ix(
            accounts::SettleAuction {
                payer: payer.pubkey(),
                seller: self.seller.pubkey(),
                receiver,
                auction: self.auction,
                mint: self.mint,
                vault: ata(&self.auction, &self.mint),
                receiver_token_account: ata(&receiver, &self.mint),
                token_program: spl_token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::SettleAuction {},
        )
    }

    fn auction(&self) -> Auction {
        let acc = self.svm.get_account(&self.auction).unwrap();
        Auction::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }
}

#[test]
fn bidding_refunds_and_settlement() {
    let mut env = setup();
    let alice = env.bidder();
    let bob = env.bidder();
    assert_eq!(
        token_balance(&env.svm, ata(&env.auction, &env.mint)),
        Some(1)
    );

    let below_min = env.bid_ix(&alice, alice.pubkey(), SOL / 2);
    expect_error(&mut env.svm, &[below_min], &[&alice], "BidTooLow");

    let a = env.bid_ix(&alice, alice.pubkey(), 2 * SOL);
    send(&mut env.svm, &[a], &[&alice]).unwrap();
    let alice_after_bid = lamports(&env.svm, alice.pubkey());

    // Needs at least 2.1 SOL (5% increment).
    let small = env.bid_ix(&bob, alice.pubkey(), 2 * SOL + SOL / 20 - 1);
    expect_error(&mut env.svm, &[small], &[&bob], "BidTooLow");
    // Refund must go to the actual previous bidder.
    let wrong = env.bid_ix(&bob, bob.pubkey(), 3 * SOL);
    expect_error(&mut env.svm, &[wrong], &[&bob], "WrongPreviousBidder");

    let b = env.bid_ix(&bob, alice.pubkey(), 3 * SOL);
    send(&mut env.svm, &[b], &[&bob]).unwrap();
    assert_eq!(
        lamports(&env.svm, alice.pubkey()),
        alice_after_bid + 2 * SOL
    );
    assert_eq!(env.auction().highest_bidder, bob.pubkey());

    let early = env.settle_ix(&alice, bob.pubkey());
    expect_error(&mut env.svm, &[early], &[&alice], "AuctionActive");

    warp(&mut env.svm, NOW + DURATION);
    let late_bid = env.bid_ix(&alice, bob.pubkey(), 4 * SOL);
    expect_error(&mut env.svm, &[late_bid], &[&alice], "AuctionEnded");

    let seller_before = lamports(&env.svm, env.seller.pubkey());
    let settle = env.settle_ix(&alice, bob.pubkey());
    send(&mut env.svm, &[settle], &[&alice]).unwrap();
    assert_eq!(
        token_balance(&env.svm, ata(&bob.pubkey(), &env.mint)),
        Some(1)
    );
    assert!(lamports(&env.svm, env.seller.pubkey()) >= seller_before + 3 * SOL);
}

#[test]
fn late_bids_extend_the_auction() {
    let mut env = setup();
    let alice = env.bidder();
    warp(&mut env.svm, NOW + DURATION - 30);
    let a = env.bid_ix(&alice, alice.pubkey(), SOL);
    send(&mut env.svm, &[a], &[&alice]).unwrap();
    assert_eq!(env.auction().ends_at, NOW + DURATION - 30 + 300);
}

#[test]
fn seller_can_cancel_only_without_bids() {
    let mut env = setup();
    let seller = env.seller.insecure_clone();
    let cancel = ix(
        accounts::CancelAuction {
            seller: seller.pubkey(),
            auction: env.auction,
            mint: env.mint,
            vault: ata(&env.auction, &env.mint),
            seller_token_account: ata(&seller.pubkey(), &env.mint),
            token_program: spl_token::ID,
        },
        instruction::CancelAuction {},
    );

    let alice = env.bidder();
    let a = env.bid_ix(&alice, alice.pubkey(), SOL);
    send(&mut env.svm, &[a], &[&alice]).unwrap();
    expect_error(
        &mut env.svm,
        std::slice::from_ref(&cancel),
        &[&seller],
        "HasBids",
    );

    // A fresh auction without bids can be cancelled.
    let mut env = setup();
    let seller = env.seller.insecure_clone();
    let cancel = ix(
        accounts::CancelAuction {
            seller: seller.pubkey(),
            auction: env.auction,
            mint: env.mint,
            vault: ata(&env.auction, &env.mint),
            seller_token_account: ata(&seller.pubkey(), &env.mint),
            token_program: spl_token::ID,
        },
        instruction::CancelAuction {},
    );
    send(&mut env.svm, &[cancel], &[&seller]).unwrap();
    assert_eq!(
        token_balance(&env.svm, ata(&seller.pubkey(), &env.mint)),
        Some(1)
    );
}
