//! End-to-end governance flow against the compiled SBF program in LiteSVM.
//! Build the program first: `anchor build`.

use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::token::spl_token;
use governance_token::instructions::GovernanceParams;
use governance_token::state::*;
use governance_token::{accounts, instruction};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const START_TS: i64 = 1_800_000_000;
const VOTING_PERIOD: i64 = 3_600;

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &governance_token::ID).0
}

fn ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: governance_token::ID,
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

fn expect_error(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], code: &str) {
    match send(svm, ixs, signers) {
        Ok(()) => panic!("expected {code}, but the transaction succeeded"),
        Err(logs) => assert!(logs.contains(code), "expected {code}, got:\n{logs}"),
    }
}

fn warp(svm: &mut LiteSVM, ts: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = ts;
    clock.slot += 1;
    svm.set_sysvar(&clock);
}

fn token_account(svm: &mut LiteSVM, mint: Pubkey, owner: Pubkey) -> Pubkey {
    let address = Pubkey::new_unique();
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account {
        mint,
        owner,
        amount: 0,
        delegate: COption::None,
        state: spl_token::state::AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    }
    .pack_into_slice(&mut data);
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
    address
}

fn balance(svm: &LiteSVM, address: Pubkey) -> u64 {
    spl_token::state::Account::unpack(&svm.get_account(&address).unwrap().data)
        .unwrap()
        .amount
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, address: Pubkey) -> T {
    T::try_deserialize(&mut svm.get_account(&address).unwrap().data.as_slice()).unwrap()
}

#[test]
fn stake_propose_vote_finalize() {
    let so = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/deploy/governance_token.so");
    assert!(
        so.exists(),
        "missing {}; run `anchor build` first",
        so.display()
    );
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(governance_token::ID, &so)
        .unwrap();
    warp(&mut svm, START_TS);

    let authority = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    for kp in [&authority, &alice, &bob] {
        svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    }

    let config = pda(&[CONFIG_SEED]);
    let mint = pda(&[MINT_SEED]);
    let vault = pda(&[VAULT_SEED]);
    let init = ix(
        accounts::InitializeGovernance {
            authority: authority.pubkey(),
            config,
            mint,
            vault,
            token_program: spl_token::ID,
            system_program: anchor_lang::system_program::ID,
        },
        instruction::Initialize {
            decimals: 6,
            params: GovernanceParams {
                voting_period_secs: VOTING_PERIOD,
                quorum_votes: 1_000,
                proposal_threshold: 500,
            },
        },
    );
    send(&mut svm, &[init], &[&authority]).unwrap();

    // Distribute tokens and stake them.
    let mut stakes = vec![];
    for (kp, amount) in [(&alice, 800u64), (&bob, 400u64)] {
        let ta = token_account(&mut svm, mint, kp.pubkey());
        let mint_ix = ix(
            accounts::MintTokens {
                authority: authority.pubkey(),
                config,
                mint,
                destination: ta,
                token_program: spl_token::ID,
            },
            instruction::MintTokens { amount },
        );
        send(&mut svm, &[mint_ix], &[&authority]).unwrap();

        let stake = pda(&[STAKE_SEED, kp.pubkey().as_ref()]);
        let create = ix(
            accounts::CreateStakeAccount {
                owner: kp.pubkey(),
                stake,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::CreateStakeAccount {},
        );
        let stake_ix = ix(
            accounts::Stake {
                owner: kp.pubkey(),
                config,
                stake,
                mint,
                vault,
                owner_token_account: ta,
                token_program: spl_token::ID,
            },
            instruction::Stake { amount },
        );
        send(&mut svm, &[create, stake_ix], &[kp]).unwrap();
        stakes.push((stake, ta));
    }
    assert_eq!(balance(&svm, vault), 1_200);

    // Bob is below the proposal threshold.
    let proposal = pda(&[PROPOSAL_SEED, &0u64.to_le_bytes()]);
    let propose = |proposer: &Keypair, stake: Pubkey| {
        ix(
            accounts::CreateProposal {
                proposer: proposer.pubkey(),
                config,
                stake,
                proposal,
                system_program: anchor_lang::system_program::ID,
            },
            instruction::CreateProposal {
                title: "Raise SOL/USDC LTV to 80%".into(),
                description_uri: "ipfs://bafy-example".into(),
            },
        )
    };
    expect_error(
        &mut svm,
        &[propose(&bob, stakes[1].0)],
        &[&bob],
        "BelowProposalThreshold",
    );
    send(&mut svm, &[propose(&alice, stakes[0].0)], &[&alice]).unwrap();

    let vote = |voter: &Keypair, stake: Pubkey, choice: VoteChoice| {
        ix(
            accounts::CastVote {
                voter: voter.pubkey(),
                proposal,
                stake,
                vote_record: pda(&[VOTE_SEED, proposal.as_ref(), voter.pubkey().as_ref()]),
                system_program: anchor_lang::system_program::ID,
            },
            instruction::CastVote { choice },
        )
    };
    send(
        &mut svm,
        &[vote(&alice, stakes[0].0, VoteChoice::For)],
        &[&alice],
    )
    .unwrap();
    send(
        &mut svm,
        &[vote(&bob, stakes[1].0, VoteChoice::Against)],
        &[&bob],
    )
    .unwrap();
    // A second vote from the same wallet fails because the vote record exists.
    expect_error(
        &mut svm,
        &[vote(&alice, stakes[0].0, VoteChoice::For)],
        &[&alice],
        "already in use",
    );

    // Voting locked the stake until the proposal closes.
    let unstake = ix(
        accounts::Stake {
            owner: alice.pubkey(),
            config,
            stake: stakes[0].0,
            mint,
            vault,
            owner_token_account: stakes[0].1,
            token_program: spl_token::ID,
        },
        instruction::Unstake { amount: 800 },
    );
    expect_error(
        &mut svm,
        std::slice::from_ref(&unstake),
        &[&alice],
        "StakeLocked",
    );

    let finalize = ix(
        accounts::FinalizeProposal { config, proposal },
        instruction::FinalizeProposal {},
    );
    expect_error(
        &mut svm,
        std::slice::from_ref(&finalize),
        &[&alice],
        "VotingOpen",
    );

    warp(&mut svm, START_TS + VOTING_PERIOD + 1);
    send(&mut svm, &[finalize], &[&alice]).unwrap();
    let p: Proposal = read(&svm, proposal);
    assert_eq!(p.status, ProposalStatus::Succeeded);
    assert_eq!((p.votes_for, p.votes_against), (800, 400));

    send(&mut svm, &[unstake], &[&alice]).unwrap();
    assert_eq!(balance(&svm, stakes[0].1), 800);
}
