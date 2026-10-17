import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUCTION_PROGRAM_ID,
  DEFAULT_MARKETPLACE_PROGRAM_ID,
  DEFAULT_RPC_URL,
  config,
  explorerAddressUrl,
  parseAddress,
  parseCluster,
  parseRpcUrl,
  walletChain,
} from "./config";

describe("config", () => {
  it("uses devnet defaults when env vars are absent", () => {
    expect(config.marketplaceProgramId).toBe(DEFAULT_MARKETPLACE_PROGRAM_ID);
    expect(config.auctionProgramId).toBe(DEFAULT_AUCTION_PROGRAM_ID);
  });
  it("falls back on invalid values", () => {
    expect(parseRpcUrl("javascript:alert(1)")).toBe(DEFAULT_RPC_URL);
    expect(parseCluster("")).toBe("devnet");
    expect(parseAddress("xyz", DEFAULT_AUCTION_PROGRAM_ID)).toBe(DEFAULT_AUCTION_PROGRAM_ID);
  });
  it("maps clusters", () => {
    expect(walletChain("testnet")).toBe("solana:testnet");
    expect(explorerAddressUrl("abc", "localnet")).toContain("cluster=custom");
  });
});
