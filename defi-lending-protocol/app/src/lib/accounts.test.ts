import { createHash } from "node:crypto";
import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  DISCRIMINATORS,
  type Market,
  type Position,
  type Proposal,
  ProposalStatus,
  type Protocol,
  WAD,
  marketCodec,
  positionCodec,
  proposalCodec,
  protocolCodec,
} from "./accounts";
import { toBase58 } from "./rpc";

const A = address("4sohRUrhAnm75sFwUbeE6tJHRQCNq5MMf4PEYEUi1WdD");
const B = address("JCFC4bviKZmiVdsDkvzXjRCzE9Yc7P1VumkgkiBvQ43c");
const C = address("So11111111111111111111111111111111111111112");
const D = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

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

  it("base58-encodes for memcmp filters", () => {
    expect(toBase58(DISCRIMINATORS.Market)).toBe("dkokXHR3DTw");
  });
});

const sampleMarket: Market = {
  protocol: A,
  collateralMint: C,
  loanMint: D,
  collateralVault: B,
  loanVault: A,
  shareMint: B,
  tokenProgram: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  collateralDecimals: 9,
  loanDecimals: 6,
  collateralFeedId: new Uint8Array(32).fill(7),
  loanFeedId: new Uint8Array(32).fill(9),
  config: {
    ltvBps: 7_500,
    liquidationThresholdBps: 8_000,
    liquidationBonusBps: 500,
    reserveFactorBps: 1_000,
    flashLoanFeeBps: 9,
    maxPriceAgeSecs: 60n,
    rateModel: { baseRateBps: 200, slope1Bps: 400, slope2Bps: 7_500, optimalUtilizationBps: 8_000 },
  },
  totalDeposits: 1_000_000_000n,
  totalShares: 990_000_000n,
  totalBorrows: 600_000_000n,
  totalReserves: 1_234n,
  borrowIndex: WAD + WAD / 20n,
  lastAccrualTs: 1_760_000_000n,
  flashLoanAmount: 0n,
  flashLoanActive: false,
  paused: true,
  bump: 254,
};

describe("Market codec", () => {
  it("round-trips and has the expected Borsh size", () => {
    const bytes = marketCodec.encode(sampleMarket);
    // 8 disc + 7*32 pubkeys + 2 u8 + 2*32 feeds + config(5*2 + 8 + 14) + 4*8 + 16 + 8 + 8 + 3*1
    expect(bytes.length).toBe(8 + 224 + 2 + 64 + 32 + 32 + 16 + 8 + 8 + 3);
    expect([...bytes.slice(0, 8)]).toEqual([...DISCRIMINATORS.Market]);
    expect(marketCodec.decode(bytes)).toEqual(sampleMarket);
  });

  it("rejects data with another account's discriminator", () => {
    const bytes = new Uint8Array(marketCodec.encode(sampleMarket));
    bytes.set(DISCRIMINATORS.Position, 0);
    expect(() => marketCodec.decode(bytes)).toThrow();
  });
});

describe("Position codec", () => {
  it("round-trips with owner right after the discriminator", () => {
    const position: Position = {
      owner: B,
      market: A,
      collateralAmount: 5_000_000_000n,
      borrowScaled: 123_456_789_000_000_000_000n,
      bump: 1,
    };
    const bytes = positionCodec.encode(position);
    expect(bytes.length).toBe(8 + 32 + 32 + 8 + 16 + 1);
    expect(toBase58(bytes.slice(8, 40))).toBe(B);
    expect(positionCodec.decode(bytes)).toEqual(position);
  });
});

describe("Protocol codec", () => {
  it("round-trips", () => {
    const protocol: Protocol = { admin: A, paused: false, marketCount: 3n, bump: 255 };
    const bytes = protocolCodec.encode(protocol);
    expect(bytes.length).toBe(8 + 32 + 1 + 8 + 1);
    expect(protocolCodec.decode(bytes)).toEqual(protocol);
  });
});

describe("Proposal codec", () => {
  it("round-trips variable-length Borsh strings and the status enum", () => {
    const proposal: Proposal = {
      id: 42n,
      proposer: C,
      title: "Raise SOL/USDC LTV to 80% ✓",
      descriptionUri: "https://example.org/proposals/42",
      votesFor: 1_000n,
      votesAgainst: 250n,
      votesAbstain: 5n,
      votingStartsAt: 1_760_000_000n,
      votingEndsAt: 1_760_604_800n,
      status: ProposalStatus.Defeated,
      bump: 200,
    };
    const bytes = proposalCodec.encode(proposal);
    const titleLen = new TextEncoder().encode(proposal.title).length;
    // u32 little-endian length prefix right after id (8) + proposer (32)
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(8 + 8 + 32, true)).toBe(titleLen);
    expect(proposalCodec.decode(bytes)).toEqual(proposal);
  });
});
