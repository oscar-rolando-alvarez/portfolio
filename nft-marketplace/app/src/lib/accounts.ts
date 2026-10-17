import {
  type Address,
  type ReadonlyUint8Array,
  getAddressCodec,
  getBooleanCodec,
  getConstantCodec,
  getHiddenPrefixCodec,
  getI64Codec,
  getStructCodec,
  getU16Codec,
  getU64Codec,
  getU8Codec,
} from "@solana/kit";

/**
 * Anchor account discriminators: first 8 bytes of sha256("account:<AccountName>").
 * Verified against node:crypto in accounts.test.ts.
 */
export const DISCRIMINATORS = {
  Marketplace: new Uint8Array([70, 222, 41, 62, 78, 3, 32, 174]),
  Listing: new Uint8Array([218, 32, 50, 73, 43, 134, 26, 58]),
  Offer: new Uint8Array([215, 88, 60, 71, 170, 162, 73, 229]),
  Auction: new Uint8Array([218, 94, 247, 242, 126, 233, 131, 81]),
} as const satisfies Record<string, Uint8Array>;

export type AccountName = keyof typeof DISCRIMINATORS;

export interface Marketplace {
  admin: Address;
  treasury: Address;
  feeBps: number;
  paused: boolean;
  totalVolume: bigint;
  totalSales: bigint;
  bump: number;
}

export interface Listing {
  seller: Address;
  mint: Address;
  /** Lamports. */
  price: bigint;
  /** Unix seconds; 0 = never expires. */
  expiresAt: bigint;
  createdAt: bigint;
  bump: number;
}

export interface Offer {
  buyer: Address;
  mint: Address;
  /** Lamports. */
  amount: bigint;
  expiresAt: bigint;
  bump: number;
}

export interface Auction {
  seller: Address;
  mint: Address;
  minBid: bigint;
  minIncrementBps: number;
  highestBid: bigint;
  highestBidder: Address;
  startsAt: bigint;
  endsAt: bigint;
  bump: number;
}

/** Prefix that writes / verifies the Anchor discriminator on encode / decode. */
const discriminator = (name: AccountName) => [getConstantCodec(DISCRIMINATORS[name])];

export const marketplaceCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["admin", getAddressCodec()],
    ["treasury", getAddressCodec()],
    ["feeBps", getU16Codec()],
    ["paused", getBooleanCodec()],
    ["totalVolume", getU64Codec()],
    ["totalSales", getU64Codec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Marketplace"),
);

export const listingCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["seller", getAddressCodec()],
    ["mint", getAddressCodec()],
    ["price", getU64Codec()],
    ["expiresAt", getI64Codec()],
    ["createdAt", getI64Codec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Listing"),
);

export const offerCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["buyer", getAddressCodec()],
    ["mint", getAddressCodec()],
    ["amount", getU64Codec()],
    ["expiresAt", getI64Codec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Offer"),
);

export const auctionCodec = getHiddenPrefixCodec(
  getStructCodec([
    ["seller", getAddressCodec()],
    ["mint", getAddressCodec()],
    ["minBid", getU64Codec()],
    ["minIncrementBps", getU16Codec()],
    ["highestBid", getU64Codec()],
    ["highestBidder", getAddressCodec()],
    ["startsAt", getI64Codec()],
    ["endsAt", getI64Codec()],
    ["bump", getU8Codec()],
  ]),
  discriminator("Auction"),
);

export function decodeMarketplace(data: ReadonlyUint8Array): Marketplace {
  return marketplaceCodec.decode(data);
}

export function decodeListing(data: ReadonlyUint8Array): Listing {
  return listingCodec.decode(data);
}

export function decodeOffer(data: ReadonlyUint8Array): Offer {
  return offerCodec.decode(data);
}

export function decodeAuction(data: ReadonlyUint8Array): Auction {
  return auctionCodec.decode(data);
}
