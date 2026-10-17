import { type Address, isAddress } from "@solana/kit";

export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
export const DEFAULT_MARKETPLACE_PROGRAM_ID = "BKvFQqBhXJNpKjmAzwvsbuHGKG54EPcdcV7YmRfxw1Te";
export const DEFAULT_AUCTION_PROGRAM_ID = "5YeC15ieZAhKmeDeVHR1xDzC6patSL68yQTtgqEio7Sh";

export const CLUSTERS = ["devnet", "testnet", "mainnet-beta", "localnet"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export function parseCluster(value: string | undefined): Cluster {
  const v = value?.trim();
  return CLUSTERS.find((c) => c === v) ?? "devnet";
}

export function parseAddress(value: string | undefined, fallback: string): Address {
  const v = value?.trim();
  if (v && isAddress(v)) return v;
  if (!isAddress(fallback)) throw new Error(`Invalid fallback address: ${fallback}`);
  return fallback;
}

export function parseRpcUrl(value: string | undefined): string {
  const v = value?.trim();
  if (!v) return DEFAULT_RPC_URL;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : DEFAULT_RPC_URL;
  } catch {
    return DEFAULT_RPC_URL;
  }
}

// NEXT_PUBLIC_* variables must be referenced literally so Next.js can inline them.
export const config = {
  rpcUrl: parseRpcUrl(process.env.NEXT_PUBLIC_RPC_URL),
  cluster: parseCluster(process.env.NEXT_PUBLIC_CLUSTER),
  marketplaceProgramId: parseAddress(
    process.env.NEXT_PUBLIC_MARKETPLACE_PROGRAM_ID,
    DEFAULT_MARKETPLACE_PROGRAM_ID,
  ),
  auctionProgramId: parseAddress(process.env.NEXT_PUBLIC_AUCTION_PROGRAM_ID, DEFAULT_AUCTION_PROGRAM_ID),
} as const;

/** Wallet Standard chain identifier for the configured cluster. */
export function walletChain(cluster: Cluster = config.cluster): `solana:${string}` {
  return cluster === "mainnet-beta" ? "solana:mainnet" : `solana:${cluster}`;
}

export function explorerAddressUrl(addr: string, cluster: Cluster = config.cluster): string {
  const base = `https://explorer.solana.com/address/${addr}`;
  if (cluster === "mainnet-beta") return base;
  if (cluster === "localnet") {
    return `${base}?cluster=custom&customUrl=${encodeURIComponent("http://localhost:8899")}`;
  }
  return `${base}?cluster=${cluster}`;
}
