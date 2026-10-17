import { describe, expect, it } from "vitest";
import {
  NO_BIDDER,
  auctionPhase,
  feeForPrice,
  hasBids,
  hashString,
  isListingActive,
  nextMinimumBid,
  placeholderArt,
} from "./market";

describe("nextMinimumBid", () => {
  it("is min_bid when there are no bids", () => {
    expect(nextMinimumBid({ minBid: 1_000n, highestBid: 0n, minIncrementBps: 500 })).toBe(1_000n);
  });
  it("adds the increment to the highest bid", () => {
    // 1.3 SOL + 5% = 1.365 SOL
    expect(
      nextMinimumBid({ minBid: 1_000_000_000n, highestBid: 1_300_000_000n, minIncrementBps: 500 }),
    ).toBe(1_365_000_000n);
  });
  it("rounds the increment up", () => {
    // 101 * 1% = 1.01 -> 2
    expect(nextMinimumBid({ minBid: 1n, highestBid: 101n, minIncrementBps: 100 })).toBe(103n);
    // 1 * 1bps = 0.0001 -> 1
    expect(nextMinimumBid({ minBid: 0n, highestBid: 1n, minIncrementBps: 1 })).toBe(2n);
  });
  it("never goes below min_bid", () => {
    expect(nextMinimumBid({ minBid: 5_000n, highestBid: 100n, minIncrementBps: 1_000 })).toBe(5_000n);
  });
  it("with a zero increment equals the highest bid", () => {
    expect(nextMinimumBid({ minBid: 10n, highestBid: 50n, minIncrementBps: 0 })).toBe(50n);
  });
});

describe("auctionPhase / hasBids", () => {
  const a = { startsAt: 100n, endsAt: 200n };
  it("derives the phase from the clock", () => {
    expect(auctionPhase(a, 50)).toBe("upcoming");
    expect(auctionPhase(a, 100)).toBe("live");
    expect(auctionPhase(a, 200)).toBe("ended");
    expect(auctionPhase(a, 0)).toBe("live");
  });
  it("detects bids", () => {
    expect(hasBids({ highestBid: 0n, highestBidder: NO_BIDDER })).toBe(false);
    expect(hasBids({ highestBid: 5n, highestBidder: "BKvFQqBhXJNpKjmAzwvsbuHGKG54EPcdcV7YmRfxw1Te" })).toBe(true);
  });
});

describe("listings", () => {
  it("treats expires_at = 0 as never expiring", () => {
    expect(isListingActive({ expiresAt: 0n }, 1_000)).toBe(true);
    expect(isListingActive({ expiresAt: 999n }, 1_000)).toBe(false);
    expect(isListingActive({ expiresAt: 1_001n }, 1_000)).toBe(true);
  });
  it("computes fees in lamports", () => {
    expect(feeForPrice(2_000_000_000n, 250)).toBe(50_000_000n);
    expect(feeForPrice(3n, 5_000)).toBe(1n);
  });
});

describe("placeholderArt", () => {
  it("is deterministic per mint", () => {
    const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    expect(placeholderArt(mint)).toEqual(placeholderArt(mint));
    expect(hashString(mint)).toBe(hashString(mint));
    expect(placeholderArt(mint)).not.toEqual(placeholderArt("So11111111111111111111111111111111111111112"));
  });
});
