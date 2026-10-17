import {
  DISCRIMINATORS,
  decodeAuction,
  decodeListing,
  decodeMarketplace,
  decodeOffer,
} from "./accounts";
import { config } from "./config";
import { fetchProgramAccounts } from "./rpc";

export function fetchMarketplaces() {
  return fetchProgramAccounts(config.marketplaceProgramId, DISCRIMINATORS.Marketplace, decodeMarketplace);
}

export async function fetchListingsWithOffers() {
  const [listings, offers] = await Promise.all([
    fetchProgramAccounts(config.marketplaceProgramId, DISCRIMINATORS.Listing, decodeListing),
    fetchProgramAccounts(config.marketplaceProgramId, DISCRIMINATORS.Offer, decodeOffer),
  ]);
  // Newest first.
  listings.accounts.sort((a, b) =>
    a.data.createdAt === b.data.createdAt ? 0 : a.data.createdAt > b.data.createdAt ? -1 : 1,
  );
  return { listings, offers };
}

export async function fetchAuctions() {
  const result = await fetchProgramAccounts(config.auctionProgramId, DISCRIMINATORS.Auction, decodeAuction);
  // Soonest-ending first.
  result.accounts.sort((a, b) =>
    a.data.endsAt === b.data.endsAt ? 0 : a.data.endsAt < b.data.endsAt ? -1 : 1,
  );
  return result;
}
