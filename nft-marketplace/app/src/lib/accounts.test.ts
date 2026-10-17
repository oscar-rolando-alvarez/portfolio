import { createHash } from "node:crypto";
import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  type Auction,
  DISCRIMINATORS,
  type Listing,
  type Marketplace,
  type Offer,
  auctionCodec,
  listingCodec,
  marketplaceCodec,
  offerCodec,
} from "./accounts";
import { toBase58 } from "./rpc";

const A = address("BKvFQqBhXJNpKjmAzwvsbuHGKG54EPcdcV7YmRfxw1Te");
const B = address("5YeC15ieZAhKmeDeVHR1xDzC6patSL68yQTtgqEio7Sh");
const MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

function anchorDiscriminator(name: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`account:${name}`).digest().subarray(0, 8));
}

describe("discriminators", () => {
  it.each(Object.keys(DISCRIMINATORS) as (keyof typeof DISCRIMINATORS)[])(
    "%s matches sha256('account:<Name>')[0..8]",
    (name) => {
      expect([...DISCRIMINATORS[name]]).toEqual([...anchorDiscriminator(name)]);
    },
  );
});

describe("codecs round-trip", () => {
  it("Marketplace", () => {
    const value: Marketplace = {
      admin: A,
      treasury: B,
      feeBps: 250,
      paused: false,
      totalVolume: 123_456_789_000n,
      totalSales: 42n,
      bump: 255,
    };
    const bytes = marketplaceCodec.encode(value);
    expect(bytes.length).toBe(8 + 32 + 32 + 2 + 1 + 8 + 8 + 1);
    expect([...bytes.slice(0, 8)]).toEqual([...DISCRIMINATORS.Marketplace]);
    expect(marketplaceCodec.decode(bytes)).toEqual(value);
  });

  it("Listing (seller right after the discriminator)", () => {
    const value: Listing = {
      seller: A,
      mint: MINT,
      price: 2_500_000_000n,
      expiresAt: 0n,
      createdAt: 1_760_000_000n,
      bump: 7,
    };
    const bytes = listingCodec.encode(value);
    expect(bytes.length).toBe(8 + 32 + 32 + 8 + 8 + 8 + 1);
    expect(toBase58(bytes.slice(8, 40))).toBe(A);
    expect(listingCodec.decode(bytes)).toEqual(value);
  });

  it("Offer", () => {
    const value: Offer = { buyer: B, mint: MINT, amount: 1n, expiresAt: -1n, bump: 1 };
    const bytes = offerCodec.encode(value);
    expect(bytes.length).toBe(8 + 32 + 32 + 8 + 8 + 1);
    expect(offerCodec.decode(bytes)).toEqual(value);
  });

  it("Auction", () => {
    const value: Auction = {
      seller: A,
      mint: MINT,
      minBid: 1_000_000_000n,
      minIncrementBps: 500,
      highestBid: 1_300_000_000n,
      highestBidder: B,
      startsAt: 1_760_000_000n,
      endsAt: 1_760_086_400n,
      bump: 3,
    };
    const bytes = auctionCodec.encode(value);
    expect(bytes.length).toBe(8 + 32 + 32 + 8 + 2 + 8 + 32 + 8 + 8 + 1);
    expect(auctionCodec.decode(bytes)).toEqual(value);
  });

  it("rejects data with a different discriminator", () => {
    const bytes = new Uint8Array(
      listingCodec.encode({ seller: A, mint: MINT, price: 1n, expiresAt: 0n, createdAt: 0n, bump: 0 }),
    );
    bytes.set(DISCRIMINATORS.Offer, 0);
    expect(() => listingCodec.decode(bytes)).toThrow();
  });
});
