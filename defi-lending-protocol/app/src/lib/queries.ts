import type { Address } from "@solana/kit";
import {
  DISCRIMINATORS,
  FIRST_FIELD_OFFSET,
  decodeMarket,
  decodePosition,
  decodeProposal,
  decodeProtocol,
} from "./accounts";
import { config } from "./config";
import { fetchProgramAccounts } from "./rpc";

export function fetchMarkets() {
  return fetchProgramAccounts(config.lendingProgramId, DISCRIMINATORS.Market, decodeMarket);
}

export function fetchProtocols() {
  return fetchProgramAccounts(config.lendingProgramId, DISCRIMINATORS.Protocol, decodeProtocol);
}

/** Positions owned by `owner` (Position.owner is the first field, right after the discriminator). */
export function fetchPositionsByOwner(owner: Address) {
  return fetchProgramAccounts(config.lendingProgramId, DISCRIMINATORS.Position, decodePosition, [
    { offset: FIRST_FIELD_OFFSET, bytes: owner },
  ]);
}

export async function fetchProposals() {
  const result = await fetchProgramAccounts(
    config.governanceProgramId,
    DISCRIMINATORS.Proposal,
    decodeProposal,
  );
  result.accounts.sort((a, b) => (a.data.id === b.data.id ? 0 : a.data.id > b.data.id ? -1 : 1));
  return result;
}
