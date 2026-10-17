# Security

> **Status:** portfolio / reference implementation. The programs have **not been audited** and are
> not deployed to mainnet.

## Reporting a vulnerability

Report suspected issues privately via
[GitHub Security Advisories](https://github.com/oscar-rolando-alvarez/portfolio/security/advisories/new)
with the affected program/instruction and a reproduction (ideally a LiteSVM test).

## Implemented controls

### Marketplace program
- **Escrow, not delegation.** Listed NFTs move into an associated token account owned by the
  listing PDA (`["listing", mint]`), so a listing can never be sold twice or emptied by the seller.
- **NFT check.** Only mints with `decimals == 0` and `supply == 1` can be listed or auctioned.
- **Slippage guard.** `purchase_nft(max_price)` fails if the seller raised the price after the buyer
  signed.
- **Account binding.** `has_one` / `address` constraints bind the listing to its seller and mint, the
  treasury to the marketplace config, and vaults to the listing PDA via associated-token constraints.
- **Offers** escrow lamports inside a program-owned PDA (`["offer", mint, buyer]`). Only the buyer can
  cancel (closing returns escrow + rent); acceptance requires an unexpired offer and the seller's
  signature on an active listing.
- **Admin** (`has_one = admin`) can change the fee (capped at 10%), treasury and pause flag, and
  rotate the admin key. Pausing blocks new listings, purchases, offers and acceptances; delisting and
  cancelling offers always remain possible so users can recover assets.
- Fee math uses `u128` intermediates; the fee cap guarantees `fee ≤ price`.
- Direct lamport moves from program-owned accounts happen after all CPIs to satisfy runtime balance
  checks.

### Auction program
- NFT escrowed in the auction PDA's associated token account until settlement or cancellation.
- Each bid must beat `max(min_bid, highest + increment)` (increment rounded up, strictly increasing);
  the previous highest bidder is refunded atomically and must be the account passed as
  `previous_bidder`.
- Sellers cannot bid on their own auctions; bids in the last 5 minutes extend the auction
  (anti-sniping).
- Settlement is permissionless after `ends_at`; the NFT can only go to the recorded winner (or back to
  the seller if there were no bids). Cancellation is only possible before the first bid.

## Known limitations
- Creator royalties are not enforced by the marketplace program (the companion `nft-minting`
  program records `royalty_bps` in on-chain metadata for marketplaces that choose to honour it).
- Admin is a single key; production deployments should use a multisig.
- Token-2022 NFTs with transfer hooks are not supported.

## Verification in CI
`cargo fmt --check`, `cargo clippy -D warnings`, `anchor build`, unit tests and LiteSVM end-to-end
tests (list/purchase, slippage guard, delist, offers, admin/pause, bidding/refunds, anti-sniping,
settlement, cancellation) run on every push. `cargo audit` and `npm audit` run as advisory jobs.
