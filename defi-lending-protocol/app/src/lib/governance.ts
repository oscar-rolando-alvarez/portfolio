import { type Proposal, ProposalStatus } from "./accounts";

export type ProposalPhase =
  | { kind: "upcoming"; label: string }
  | { kind: "voting"; label: string }
  | { kind: "awaiting"; label: string }
  | { kind: "succeeded"; label: string }
  | { kind: "defeated"; label: string };

/**
 * Display phase for a proposal at unix time `now` (seconds). `now === 0` means the clock is
 * unknown (server render), in which case only the on-chain status is used.
 */
export function proposalPhase(
  p: Pick<Proposal, "status" | "votingStartsAt" | "votingEndsAt">,
  now: number,
): ProposalPhase {
  if (p.status === ProposalStatus.Succeeded) return { kind: "succeeded", label: "Succeeded" };
  if (p.status === ProposalStatus.Defeated) return { kind: "defeated", label: "Defeated" };
  if (now > 0) {
    const t = BigInt(Math.floor(now));
    if (t < p.votingStartsAt) return { kind: "upcoming", label: "Upcoming" };
    if (t >= p.votingEndsAt) return { kind: "awaiting", label: "Voting ended · awaiting finalization" };
  }
  return { kind: "voting", label: "Voting" };
}
