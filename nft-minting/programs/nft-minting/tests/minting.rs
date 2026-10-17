//! End-to-end minting flow against the compiled SBF program in LiteSVM
//! (which ships the Token-2022 and Associated Token Account programs).
//! Build the program first: `anchor build`.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_2022::spl_token_2022::extension::StateWithExtensions;
use litesvm::LiteSVM;
use nft_minting::state::*;
use nft_minting::{accounts, instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &nft_minting::ID).0
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token_2022::ID.as_ref(), mint.as_ref()],
        &anchor_spl::associated_token::ID,
    )
    .0
}

fn ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: nft_minting::ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
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

fn read<T: AccountDeserialize>(svm: &LiteSVM, address: Pubkey) -> T {
    T::try_deserialize(&mut svm.get_account(&address).unwrap().data.as_slice()).unwrap()
}

fn contains(haystack: &[u8], needle: &str) -> bool {
    haystack
        .windows(needle.len())
        .any(|w| w == needle.as_bytes())
}

struct Env {
    svm: LiteSVM,
    authority: Keypair,
    collection: Pubkey,
}

fn setup(max_supply: u64) -> Env {
    let so =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/nft_minting.so");
    assert!(
        so.exists(),
        "missing {}; run `anchor build` first",
        so.display()
    );
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(nft_minting::ID, &so).unwrap();
    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();

    let name = "Solana Sprites";
    let collection = pda(&[
        COLLECTION_SEED,
        authority.pubkey().as_ref(),
        name.as_bytes(),
    ]);
    let create = ix(
        accounts::CreateCollection {
            authority: authority.pubkey(),
            collection,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::CreateCollection {
            name: name.into(),
            symbol: "SPRT".into(),
            uri: "https://example.com/collection.json".into(),
            royalty_bps: 500,
            max_supply,
        },
    );
    send(&mut svm, &[create], &[&authority]).unwrap();
    Env {
        svm,
        authority,
        collection,
    }
}

impl Env {
    fn mint_ix(&self, mint: &Keypair, recipient: Pubkey, name: &str, uri: &str) -> Instruction {
        ix(
            accounts::MintNft {
                authority: self.authority.pubkey(),
                collection: self.collection,
                mint: mint.pubkey(),
                recipient,
                recipient_token_account: ata(&recipient, &mint.pubkey()),
                nft_record: pda(&[NFT_RECORD_SEED, mint.pubkey().as_ref()]),
                token_program: spl_token_2022::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::MintNft {
                name: name.into(),
                uri: uri.into(),
            },
        )
    }
}

#[test]
fn mints_token_2022_nft_with_onchain_metadata() {
    let mut env = setup(0);
    let recipient = Pubkey::new_unique();
    let mint = Keypair::new();
    let authority = env.authority.insecure_clone();
    let m = env.mint_ix(&mint, recipient, "Sprite #0", "https://example.com/0.json");
    send(&mut env.svm, &[m], &[&authority, &mint]).unwrap();

    // Exactly one token, no mint authority left.
    let mint_acc = env.svm.get_account(&mint.pubkey()).unwrap();
    assert_eq!(mint_acc.owner, spl_token_2022::ID);
    let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_acc.data).unwrap();
    assert_eq!(state.base.supply, 1);
    assert_eq!(state.base.decimals, 0);
    assert!(state.base.mint_authority.is_none());

    // Metadata lives in the mint account itself.
    assert!(contains(&mint_acc.data, "Sprite #0"));
    assert!(contains(&mint_acc.data, "SPRT"));
    assert!(contains(&mint_acc.data, "https://example.com/0.json"));
    assert!(contains(&mint_acc.data, &env.collection.to_string()));
    assert!(contains(&mint_acc.data, "royalty_bps"));

    let holder = env
        .svm
        .get_account(&ata(&recipient, &mint.pubkey()))
        .unwrap();
    let token =
        StateWithExtensions::<spl_token_2022::state::Account>::unpack(&holder.data).unwrap();
    assert_eq!(token.base.amount, 1);

    let record: NftRecord = read(&env.svm, pda(&[NFT_RECORD_SEED, mint.pubkey().as_ref()]));
    assert_eq!((record.collection, record.index), (env.collection, 0));

    // Reveal: the collection authority can repoint the metadata URI.
    let update = ix(
        accounts::UpdateNftUri {
            authority: authority.pubkey(),
            collection: env.collection,
            nft_record: pda(&[NFT_RECORD_SEED, mint.pubkey().as_ref()]),
            mint: mint.pubkey(),
            token_program: spl_token_2022::ID,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::UpdateNftUri {
            uri: "ipfs://revealed/0.json".into(),
        },
    );
    send(&mut env.svm, &[update], &[&authority]).unwrap();
    let mint_acc = env.svm.get_account(&mint.pubkey()).unwrap();
    assert!(contains(&mint_acc.data, "ipfs://revealed/0.json"));
}

#[test]
fn enforces_max_supply_and_authority() {
    let mut env = setup(1);
    let authority = env.authority.insecure_clone();
    let first = Keypair::new();
    let m = env.mint_ix(
        &first,
        Pubkey::new_unique(),
        "One",
        "https://example.com/1.json",
    );
    send(&mut env.svm, &[m], &[&authority, &first]).unwrap();

    let second = Keypair::new();
    let m = env.mint_ix(
        &second,
        Pubkey::new_unique(),
        "Two",
        "https://example.com/2.json",
    );
    let err = send(&mut env.svm, &[m], &[&authority, &second]).unwrap_err();
    assert!(err.contains("MaxSupplyReached"), "{err}");

    // A different signer cannot mint into the collection.
    let intruder = Keypair::new();
    env.svm.airdrop(&intruder.pubkey(), 1_000_000_000).unwrap();
    let third = Keypair::new();
    let mut m = env.mint_ix(
        &third,
        Pubkey::new_unique(),
        "Three",
        "https://example.com/3.json",
    );
    m.accounts[0].pubkey = intruder.pubkey();
    let err = send(&mut env.svm, &[m], &[&intruder, &third]).unwrap_err();
    assert!(err.contains("ConstraintHasOne"), "{err}");

    let c: Collection = read(&env.svm, env.collection);
    assert_eq!(c.minted, 1);
}
