# Security

> **Status:** portfolio / reference implementation. The programs have **not been audited** and are
> not deployed to mainnet. Do not use them to secure real funds.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/oscar-rolando-alvarez/portfolio/security/advisories/new)
rather than a public issue. Include the affected program, instruction, and a reproduction
(a LiteSVM test is ideal). You can expect an acknowledgement within a few days.

## Threat model and implemented controls

### Access control
| Control | Where |
| --- | --- |
| Single `Protocol` PDA records the admin; admin-only instructions use `has_one = admin` | `initialize_protocol`, `create_market`, `set_protocol_paused`, `update_market`, `collect_reserves` |
| Market accounts are only created by `create_market`; every instruction re-validates the market's mints, vaults, share mint and token program with `has_one` | all market instructions |
| Positions are PDAs of `(market, owner)`; state-changing borrower actions require the owner's signature | `deposit_collateral`, `withdraw_collateral`, `borrow` |
| Vaults and the share mint are PDAs whose authority is the market PDA | `create_market` |
| Governance: one `VoteRecord` PDA per `(proposal, voter)` prevents double voting; voting extends the stake lock to the end of the proposal, so tokens cannot be moved to vote twice | `governance-token` |

### Oracle safety (Pyth pull oracle)
- Prices are read from `PriceUpdateV2` accounts; Anchor's `Account<PriceUpdateV2>` enforces the Pyth
  Receiver program as owner.
- The feed id must match the id configured for the market side (collateral / loan).
- Updates must be **fully Wormhole-verified** and younger than `max_price_age_secs` (≤ 1 hour).
- Non-positive prices and confidence intervals wider than 2% of the price are rejected.

### Economic safety
- Interest accrues before every state change, so rates and indexes are never stale.
- Rounding always favours the protocol: shares and withdrawals round down, debt rounds up.
- Internal accounting (`total_deposits`, `total_borrows`, `total_reserves`) is used instead of vault
  balances, which neutralises token-donation / share-inflation attacks.
- Borrowing and withdrawing are limited to `total_deposits - total_borrows`; reserves are never lent.
- Market configuration is validated on creation and update: `ltv < liquidation_threshold ≤ 95%`,
  bonus ≤ 20%, reserve factor ≤ 50%, flash fee ≤ 1%, and
  `liquidation_threshold × (1 + bonus) < 100%` so a liquidation always improves the position's health.
- Liquidations repay at most 50% of the debt per call (close factor) and seize collateral worth the
  repaid value plus the bonus; if collateral is insufficient the repayment is scaled down.
- Repayments and liquidations remain available while paused so users can always reduce risk.

### Flash loans
- `flash_borrow` uses the instructions sysvar to require a matching `flash_repay` (same market, same
  amount) later in the **same transaction**, and rejects being invoked through CPI or nested flash
  loans.
- While a flash loan is active, supply, withdraw, collateral, borrow, repay, liquidation and reserve
  collection instructions on that market are rejected.

### Arithmetic
- All arithmetic is checked (`checked_*`, explicit `MathOverflow` errors) and release builds keep
  `overflow-checks = true`.

## Known limitations
- Admin is a single key. Production deployments should put it behind a multisig (e.g. Squads) and a
  timelock; the governance program records outcomes but does not execute them on-chain.
- Token-2022 mints with transfer fees or transfer hooks are not supported as market assets (internal
  accounting assumes the transferred amount is received in full).
- Simple (linear) interest per accrual; compounding emerges from frequent interaction.
- Bad debt from positions whose collateral is fully seized is not socialised automatically.

## Verification in CI
Every push runs `cargo fmt --check`, `cargo clippy -D warnings`, `anchor build` and the unit plus
LiteSVM end-to-end suites (supply/borrow/repay/withdraw, liquidation, stale/wrong oracle, flash
loans, admin controls, governance). `cargo audit` and `npm audit` run as advisory jobs.
