import { describe, expect, it } from "vitest";
import { ProposalStatus } from "./accounts";
import {
  DEFAULT_LENDING_PROGRAM_ID,
  DEFAULT_RPC_URL,
  explorerAddressUrl,
  parseAddress,
  parseCluster,
  parseRpcUrl,
  walletChain,
} from "./config";
import { proposalPhase } from "./governance";

describe("config parsing", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseRpcUrl(undefined)).toBe(DEFAULT_RPC_URL);
    expect(parseRpcUrl("ftp://nope")).toBe(DEFAULT_RPC_URL);
    expect(parseRpcUrl("not a url")).toBe(DEFAULT_RPC_URL);
    expect(parseCluster("bogus")).toBe("devnet");
    expect(parseAddress("not-an-address", DEFAULT_LENDING_PROGRAM_ID)).toBe(DEFAULT_LENDING_PROGRAM_ID);
  });
  it("accepts valid overrides", () => {
    expect(parseRpcUrl("http://127.0.0.1:8899")).toBe("http://127.0.0.1:8899/");
    expect(parseCluster("mainnet-beta")).toBe("mainnet-beta");
    expect(parseAddress("So11111111111111111111111111111111111111112", DEFAULT_LENDING_PROGRAM_ID)).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });
  it("maps clusters to wallet chains and explorer links", () => {
    expect(walletChain("devnet")).toBe("solana:devnet");
    expect(walletChain("mainnet-beta")).toBe("solana:mainnet");
    expect(explorerAddressUrl("abc", "devnet")).toBe("https://explorer.solana.com/address/abc?cluster=devnet");
    expect(explorerAddressUrl("abc", "mainnet-beta")).toBe("https://explorer.solana.com/address/abc");
  });
});

describe("proposalPhase", () => {
  const p = { status: ProposalStatus.Voting, votingStartsAt: 100n, votingEndsAt: 200n };
  it("derives voting sub-phases from the clock", () => {
    expect(proposalPhase(p, 50).kind).toBe("upcoming");
    expect(proposalPhase(p, 150).kind).toBe("voting");
    expect(proposalPhase(p, 250).kind).toBe("awaiting");
    expect(proposalPhase(p, 0).kind).toBe("voting");
  });
  it("uses final on-chain status when set", () => {
    expect(proposalPhase({ ...p, status: ProposalStatus.Succeeded }, 150).kind).toBe("succeeded");
    expect(proposalPhase({ ...p, status: ProposalStatus.Defeated }, 150).kind).toBe("defeated");
  });
});
