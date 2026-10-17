//! End-to-end marketplace flows against the compiled SBF program in LiteSVM.
//! Build the programs first: `anchor build`.

use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::token::spl_token;
use litesvm::LiteSVM;
use marketplace::instructions::MarketplaceUpdate;
use marketplace::state::*;
use marketplace::{accounts, instruction};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const SOL: u64 = 1_000_000_000;
const NOW: i64 = 1_800_000_000;

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    treasury: Pubkey,
    marketplace: Pubkey,
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &marketplace::ID).0
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token::ID.as_ref(), mint.as_ref()],
        &anchor_spl::associated_token::ID,
    )
    .0
}

fn ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: marketplace::ID,
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

/// Creates an NFT mint (decimals 0, supply 1) held by `owner`'s ATA.
fn mint_nft(svm: &mut LiteSVM, owner: Pubkey) -> (Pubkey, Pubkey) {
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

    let account = ata(&owner, &mint);
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
    put(svm, account, data);
    (mint, account)
}

fn token_balance(svm: &LiteSVM, address: Pubkey) -> Option<u64> {
    svm.get_account(&address)
        .filter(|a| a.owner == spl_token::ID && !a.data.is_empty())
        .map(|a| spl_token::state::Account::unpack(&a.data).unwrap().amount)
}

fn lamports(svm: &LiteSVM, address: Pubkey) -> u64 {
    svm.get_account(&address).map(|a| a.lamports).unwrap_or(0)
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

fn setup() -> Env {
    let so =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/marketplace.so");
    assert!(
        so.exists(),
        "missing {}; run `anchor build` first",
        so.display()
    );
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(marketplace::ID, &so).unwrap();
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = NOW;
    svm.set_sysvar(&clock);

    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 10 * SOL).unwrap();
    let treasury = Pubkey::new_unique();
    svm.airdrop(&treasury, SOL).unwrap();
    let marketplace = pda(&[MARKETPLACE_SEED]);
    let init = ix(
        accounts::InitializeMarketplace {
            admin: admin.pubkey(),
            marketplace,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::InitializeMarketplace {
            fee_bps: 250,
            treasury,
        },
    );
    send(&mut svm, &[init], &[&admin]).unwrap();
    Env {
        svm,
        admin,
        treasury,
        marketplace,
    }
}

impl Env {
    fn wallet(&mut self, sol: u64) -> Keypair {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), sol * SOL).unwrap();
        kp
    }

    fn list_ix(&self, seller: &Keypair, mint: Pubkey, price: u64) -> Instruction {
        let listing = pda(&[LISTING_SEED, mint.as_ref()]);
        ix(
            accounts::ListNft {
                seller: seller.pubkey(),
                marketplace: self.marketplace,
                mint,
                seller_token_account: ata(&seller.pubkey(), &mint),
                listing,
                vault: ata(&listing, &mint),
                token_program: spl_token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::ListNft {
                price,
                expires_at: 0,
            },
        )
    }

    fn purchase_ix(
        &self,
        buyer: &Keypair,
        seller: Pubkey,
        mint: Pubkey,
        max_price: u64,
    ) -> Instruction {
        let listing = pda(&[LISTING_SEED, mint.as_ref()]);
        ix(
            accounts::PurchaseNft {
                buyer: buyer.pubkey(),
                seller,
                marketplace: self.marketplace,
                treasury: self.treasury,
                listing,
                mint,
                vault: ata(&listing, &mint),
                buyer_token_account: ata(&buyer.pubkey(), &mint),
                token_program: spl_token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::PurchaseNft { max_price },
        )
    }
}

#[test]
fn list_and_purchase_pays_seller_and_treasury() {
    let mut env = setup();
    let seller = env.wallet(5);
    let buyer = env.wallet(10);
    let (mint, seller_ata) = mint_nft(&mut env.svm, seller.pubkey());

    let list = env.list_ix(&seller, mint, 2 * SOL);
    send(&mut env.svm, &[list], &[&seller]).unwrap();
    let listing = pda(&[LISTING_SEED, mint.as_ref()]);
    assert_eq!(token_balance(&env.svm, seller_ata), Some(0));
    assert_eq!(token_balance(&env.svm, ata(&listing, &mint)), Some(1));

    // Slippage guard: buyer only accepts up to 1 SOL.
    let low = env.purchase_ix(&buyer, seller.pubkey(), mint, SOL);
    expect_error(&mut env.svm, &[low], &[&buyer], "PriceAboveMaximum");

    let seller_before = lamports(&env.svm, seller.pubkey());
    let treasury_before = lamports(&env.svm, env.treasury);
    let buy = env.purchase_ix(&buyer, seller.pubkey(), mint, 2 * SOL);
    send(&mut env.svm, &[buy], &[&buyer]).unwrap();

    let fee = 2 * SOL * 250 / 10_000;
    assert_eq!(lamports(&env.svm, env.treasury) - treasury_before, fee);
    // Seller also receives the listing + vault rent back.
    assert!(lamports(&env.svm, seller.pubkey()) - seller_before >= 2 * SOL - fee);
    assert_eq!(
        token_balance(&env.svm, ata(&buyer.pubkey(), &mint)),
        Some(1)
    );
    assert!(
        env.svm
            .get_account(&listing)
            .is_none_or(|a| a.lamports == 0)
    );

    let m: Marketplace = read(&env.svm, env.marketplace);
    assert_eq!((m.total_sales, m.total_volume), (1, 2 * SOL));
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, address: Pubkey) -> T {
    T::try_deserialize(&mut svm.get_account(&address).unwrap().data.as_slice()).unwrap()
}

#[test]
fn delist_returns_the_nft() {
    let mut env = setup();
    let seller = env.wallet(5);
    let (mint, seller_ata) = mint_nft(&mut env.svm, seller.pubkey());
    let list = env.list_ix(&seller, mint, SOL);
    send(&mut env.svm, &[list], &[&seller]).unwrap();

    let listing = pda(&[LISTING_SEED, mint.as_ref()]);
    let delist = ix(
        accounts::DelistNft {
            seller: seller.pubkey(),
            listing,
            mint,
            vault: ata(&listing, &mint),
            seller_token_account: seller_ata,
            token_program: spl_token::ID,
        },
        instruction::DelistNft {},
    );
    send(&mut env.svm, &[delist], &[&seller]).unwrap();
    assert_eq!(token_balance(&env.svm, seller_ata), Some(1));
    assert_eq!(token_balance(&env.svm, ata(&listing, &mint)), None);
}

#[test]
fn offers_can_be_accepted_or_cancelled() {
    let mut env = setup();
    let seller = env.wallet(5);
    let alice = env.wallet(10);
    let bob = env.wallet(10);
    let (mint, _) = mint_nft(&mut env.svm, seller.pubkey());
    let list = env.list_ix(&seller, mint, 5 * SOL);
    send(&mut env.svm, &[list], &[&seller]).unwrap();

    let offer_ix = |buyer: &Keypair, amount: u64| {
        ix(
            accounts::MakeOffer {
                buyer: buyer.pubkey(),
                marketplace: env.marketplace,
                mint,
                offer: pda(&[OFFER_SEED, mint.as_ref(), buyer.pubkey().as_ref()]),
                system_program: anchor_lang::system_program::ID,
            },
            instruction::MakeOffer {
                amount,
                expires_at: NOW + 3_600,
            },
        )
    };
    let (a, b) = (offer_ix(&alice, 3 * SOL), offer_ix(&bob, 4 * SOL));
    send(&mut env.svm, &[a], &[&alice]).unwrap();
    send(&mut env.svm, &[b], &[&bob]).unwrap();

    // Alice changes her mind: escrow and rent come back.
    let alice_before = lamports(&env.svm, alice.pubkey());
    let alice_offer = pda(&[OFFER_SEED, mint.as_ref(), alice.pubkey().as_ref()]);
    let cancel = ix(
        accounts::CancelOffer {
            buyer: alice.pubkey(),
            offer: alice_offer,
        },
        instruction::CancelOffer {},
    );
    send(&mut env.svm, &[cancel], &[&alice]).unwrap();
    assert!(lamports(&env.svm, alice.pubkey()) > alice_before + 3 * SOL - 10_000);

    // Seller accepts Bob's offer.
    let listing = pda(&[LISTING_SEED, mint.as_ref()]);
    let treasury_before = lamports(&env.svm, env.treasury);
    let accept = ix(
        accounts::AcceptOffer {
            seller: seller.pubkey(),
            marketplace: env.marketplace,
            treasury: env.treasury,
            listing,
            offer: pda(&[OFFER_SEED, mint.as_ref(), bob.pubkey().as_ref()]),
            buyer: bob.pubkey(),
            mint,
            vault: ata(&listing, &mint),
            buyer_token_account: ata(&bob.pubkey(), &mint),
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::AcceptOffer {},
    );
    send(&mut env.svm, &[accept], &[&seller]).unwrap();
    assert_eq!(token_balance(&env.svm, ata(&bob.pubkey(), &mint)), Some(1));
    assert_eq!(
        lamports(&env.svm, env.treasury) - treasury_before,
        4 * SOL * 250 / 10_000
    );
}

#[test]
fn admin_can_pause_and_only_admin() {
    let mut env = setup();
    let seller = env.wallet(5);
    let (mint, _) = mint_nft(&mut env.svm, seller.pubkey());

    let update = |admin: Pubkey, env: &Env| {
        ix(
            accounts::UpdateMarketplace {
                admin,
                marketplace: env.marketplace,
            },
            instruction::UpdateMarketplace {
                update: MarketplaceUpdate {
                    paused: Some(true),
                    ..Default::default()
                },
            },
        )
    };
    let bad = update(seller.pubkey(), &env);
    expect_error(&mut env.svm, &[bad], &[&seller], "ConstraintHasOne");

    let admin = env.admin.insecure_clone();
    let good = update(admin.pubkey(), &env);
    send(&mut env.svm, &[good], &[&admin]).unwrap();
    let list = env.list_ix(&seller, mint, SOL);
    expect_error(&mut env.svm, &[list], &[&seller], "Paused");
}
