import {
  type Address,
  type ReadonlyUint8Array,
  addCodecSizePrefix,
  fixCodecSize,
  getAddressCodec,
  getBooleanCodec,
  getBytesCodec,
  getConstantCodec,
  getEnumCodec,
  getHiddenPrefixCodec,
  getI64Codec,
  getStructCodec,
  getU128Codec,
  getU16Codec,
  getU32Codec,
  getU64Codec,
  getU8Codec,
  getUtf8Codec,
} from "@solana/kit";

/**
 * Anchor account discriminators: first 8 bytes of sha256("account:<AccountName>").
 * Verified against node:crypto in accounts.test.ts.
 */
export const DISCRIMINATORS = {
  Market: new Uint8Array([219, 190, 213, 55, 0, 227, 198, 154]),
  Position: new Uint8Array([170, 188, 143, 228, 122, 64, 247, 208]),
  Protocol: new Uint8Array([45, 39, 101, 43, 115, 72, 131, 40]),
  Proposal: new Uint8Array([26, 94, 189, 187, 116, 136, 53, 33]),
} as const satisfies Record<string, Uint8Array>;

export type AccountName = keyof typeof DISCRIMINATORS;

export const DISCRIMINATOR_SIZE = 8;
/** Byte offset of the first field after the discriminator (e.g. Position.owner). */
export const FIRST_FIELD_OFFSET = 8n;

/** WAD fixed-point scale used by `Market.borrow_index`. */
export const WAD = 10n ** 18n;

export interface RateModel {
  baseRateBps: number;
  slope1Bps: number;
  slope2Bps: number;
  optimalUtilizationBps: number;
}

export interface MarketConfig {
  ltvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  reserveFactorBps: number;
  flashLoanFeeBps: number;
  maxPriceAgeSecs: bigint;
  rateModel: RateModel;
}

export interface Market {
  protocol: Address;
  collateralMint: Address;
  loanMint: Address;
  collateralVault: Address;
  loanVault: Address;
  shareMint: Address;
  tokenProgram: Address;
  collateralDecimals: number;
  loanDecimals: number;
  collateralFeedId: ReadonlyUint8Array;
  loanFeedId: ReadonlyUint8Array;
  config: MarketConfig;
  totalDeposits: bigint;
  totalShares: bigint;
  totalBorrows: bigint;
  totalReserves: bigint;
  borrowIndex: bigint;
  lastAccrualTs: bigint;
  flashLoanAmount: bigint;
  flashLoanActive: boolean;
  paused: boolean;
  bump: number;
}

export interface Position {
  owner: Address;
  market: Address;
  collateralAmount: bigint;
  borrowScaled: bigint;
  bump: number;
}

export interface Protocol {
  admin: Address;
  paused: boolean;
  marketCount: bigint;
  bump: number;
}

export enum ProposalStatus {
  Voting = 0,
  Succeeded = 1,
  Defeated = 2,
}

export interface Proposal {
  id: bigint;
  proposer: Address;
  title: string;
  descriptionUri: string;
  votesFor: bigint;
  votesAgainst: bigint;
  votesAbstain: bigint;
  votingStartsAt: bigint;
  votingEndsAt: bigint;
  status: ProposalStatus;
  bump: number;
}

const bytes32 = () => fixCodecSize(getBytesCodec(), 32);
const borshString = () => addCodecSizePrefix(getUtf8Codec(), getU32Codec());

/** Prefix that writes / verifies the Anchor discriminator on encode / decode. */
const discriminator = (name: AccountName) => [getConstantCodec(DISCRIMINATORS[name])];

export const rateModelCodec = getStructCodec([
  ["baseRateBps", getU32Codec()],
  ["slope1Bps", getU32Codec()],
  ["slope2Bps", getU32Codec()],
  ["optimalUtilizationBps", getU16Codec()],
]);

export const marketConfigCodec = getStructCodec([
  ["ltvBps", getU16Codec()],
  ["liquidationThresholdBps", getU16Codec()],
  ["liquidationBonusBps", getU16Codec()],
  ["reserveFactorBps", getU16Codec()],
  ["flashLoanFeeBps", getU16Codec()],
  ["maxPriceAgeSecs", getU64Codec()],
  ["rateModel", rateModelCodec],
]);

export const marketCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["protocol", getAddressCodec()],
    ["collateralMint", getAddressCodec()],
    ["loanMint", getAddressCodec()],
    ["collateralVault", getAddressCodec()],
    ["loanVault", getAddressCodec()],
    ["shareMint", getAddressCodec()],
    ["tokenProgram", getAddressCodec()],
    ["collateralDecimals", getU8Codec()],
    ["loanDecimals", getU8Codec()],
    ["collateralFeedId", bytes32()],
    ["loanFeedId", bytes32()],
    ["config", marketConfigCodec],
    ["totalDeposits", getU64Codec()],
    ["totalShares", getU64Codec()],
    ["totalBorrows", getU64Codec()],
    ["totalReserves", getU64Codec()],
    ["borrowIndex", getU128Codec()],
    ["lastAccrualTs", getI64Codec()],
    ["flashLoanAmount", getU64Codec()],
    ["flashLoanActive", getBooleanCodec()],
    ["paused", getBooleanCodec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Market"),
);

export const positionCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["owner", getAddressCodec()],
    ["market", getAddressCodec()],
    ["collateralAmount", getU64Codec()],
    ["borrowScaled", getU128Codec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Position"),
);

export const protocolCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["admin", getAddressCodec()],
    ["paused", getBooleanCodec()],
    ["marketCount", getU64Codec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Protocol"),
);

export const proposalCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["id", getU64Codec()],
    ["proposer", getAddressCodec()],
    ["title", borshString()],
    ["descriptionUri", borshString()],
    ["votesFor", getU64Codec()],
    ["votesAgainst", getU64Codec()],
    ["votesAbstain", getU64Codec()],
    ["votingStartsAt", getI64Codec()],
    ["votingEndsAt", getI64Codec()],
    ["status", getEnumCodec(ProposalStatus)],
    ["bump", getU8Codec()],
  ]),
  discriminator("Proposal"),
);

export function decodeMarket(data: ReadonlyUint8Array): Market {
  return marketCodec.decode(data);
}

export function decodePosition(data: ReadonlyUint8Array): Position {
  return positionCodec.decode(data);
}

export function decodeProtocol(data: ReadonlyUint8Array): Protocol {
  return protocolCodec.decode(data);
}

export function decodeProposal(data: ReadonlyUint8Array): Proposal {
  return proposalCodec.decode(data);
}
