import type { Auction, Listing } from "./accounts";

export const BPS = 10_000n;

/** The all-zero address (System Program id) used as "no bidder yet". */
export const NO_BIDDER = "11111111111111111111111111111111";

/**
 * Smallest acceptable next bid in lamports:
 * max(min_bid, highest_bid + ceil(highest_bid * min_increment_bps / 10000)).
 * With no bids yet (highest_bid == 0) this is simply min_bid.
 */
export function nextMinimumBid(
  auction: Pick<Auction, "minBid" | "highestBid" | "minIncrementBps">,
): bigint {
  const { minBid, highestBid } = auction;
  if (highestBid <= 0n) return minBid;
  const bps = BigInt(Math.max(0, Math.trunc(auction.minIncrementBps)));
  const increment = (highestBid * bps + BPS - 1n) / BPS;
  const next = highestBid + increment;
  return next > minBid ? next : minBid;
}

export type AuctionPhase = "upcoming" | "live" | "ended";

/** `now` is unix seconds; 0 means unknown (server render) and is treated as live. */
export function auctionPhase(auction: Pick<Auction, "startsAt" | "endsAt">, now: number): AuctionPhase {
  if (now <= 0) return "live";
  const t = BigInt(Math.floor(now));
  if (t < auction.startsAt) return "upcoming";
  if (t >= auction.endsAt) return "ended";
  return "live";
}

export function hasBids(auction: { highestBid: bigint; highestBidder: string }): boolean {
  return auction.highestBid > 0n && auction.highestBidder !== NO_BIDDER;
}

/** A listing is active if it never expires (0) or expires in the future. */
export function isListingActive(listing: Pick<Listing, "expiresAt">, now: number): boolean {
  if (listing.expiresAt === 0n || now <= 0) return true;
  return listing.expiresAt > BigInt(Math.floor(now));
}

/** Marketplace fee on a sale price, in lamports (rounded down). */
export function feeForPrice(price: bigint, feeBps: number): bigint {
  return (price * BigInt(Math.max(0, Math.trunc(feeBps)))) / BPS;
}

/** Deterministic 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface PlaceholderArt {
  from: string;
  to: string;
  angle: number;
  shape: "circle" | "square" | "diamond";
}

/** Generated artwork derived from the mint address, so every NFT gets a stable visual. */
export function placeholderArt(mint: string): PlaceholderArt {
  const h = hashString(mint);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >>> 9) % 140)) % 360;
  const shapes = ["circle", "square", "diamond"] as const;
  return {
    from: `hsl(${hue1} 80% 60%)`,
    to: `hsl(${hue2} 75% 45%)`,
    angle: (h >>> 17) % 360,
    shape: shapes[(h >>> 3) % shapes.length] ?? "circle",
  };
}
