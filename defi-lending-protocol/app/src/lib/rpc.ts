import {
  type Address,
  type Base58EncodedBytes,
  type ReadonlyUint8Array,
  createSolanaRpc,
  getBase58Decoder,
  getBase64Encoder,
} from "@solana/kit";
import { config } from "./config";

export type Rpc = ReturnType<typeof createSolanaRpc>;

let rpcSingleton: Rpc | undefined;

export function getRpc(): Rpc {
  rpcSingleton ??= createSolanaRpc(config.rpcUrl);
  return rpcSingleton;
}

export interface DecodedAccount<T> {
  address: Address;
  data: T;
}

export interface ProgramAccountsResult<T> {
  accounts: DecodedAccount<T>[];
  /** Accounts that matched the discriminator but failed to decode (layout mismatch). */
  skipped: number;
}

export interface MemcmpFilter {
  offset: bigint;
  /** Base58-encoded bytes to compare (an address string is already valid base58). */
  bytes: string;
}

export function toBase58(bytes: ReadonlyUint8Array): string {
  return getBase58Decoder().decode(bytes);
}

/**
 * Fetches all accounts owned by `programId` whose data starts with `discriminator`,
 * applying optional extra memcmp filters, and decodes them with `decode`.
 */
export async function fetchProgramAccounts<T>(
  programId: Address,
  discriminator: ReadonlyUint8Array,
  decode: (data: ReadonlyUint8Array) => T,
  extraFilters: readonly MemcmpFilter[] = [],
  rpc: Rpc = getRpc(),
): Promise<ProgramAccountsResult<T>> {
  const filters = [{ offset: 0n, bytes: toBase58(discriminator) }, ...extraFilters].map((f) => ({
    memcmp: { offset: f.offset, bytes: f.bytes as Base58EncodedBytes, encoding: "base58" as const },
  }));
  const raw = await rpc.getProgramAccounts(programId, { encoding: "base64", filters }).send();
  const base64 = getBase64Encoder();
  const accounts: DecodedAccount<T>[] = [];
  let skipped = 0;
  for (const item of raw) {
    try {
      accounts.push({ address: item.pubkey, data: decode(base64.encode(item.account.data[0])) });
    } catch {
      skipped++;
    }
  }
  return { accounts, skipped };
}
