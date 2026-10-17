"use client";

import type { Proposal } from "@/lib/accounts";
import { config } from "@/lib/config";
import { formatDuration, formatUnixTime, percentOf } from "@/lib/format";
import { proposalPhase } from "@/lib/governance";
import { fetchProposals } from "@/lib/queries";
import { useNow } from "@/hooks/useNow";
import { useRpcQuery } from "@/hooks/useRpcQuery";
import { AddressLink } from "../ui/AddressLink";
import { EmptyState, ErrorState, LoadingGrid, SkippedNotice } from "../ui/States";

const STATUS_STYLE: Record<string, string> = {
  upcoming: "bg-surface-muted text-muted",
  voting: "bg-accent/15 text-accent",
  awaiting: "bg-warning/15 text-warning",
  succeeded: "bg-success/15 text-success",
  defeated: "bg-danger/15 text-danger",
};

function safeHref(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function Tally({ proposal }: { proposal: Proposal }) {
  const total = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const rows = [
    { label: "For", value: proposal.votesFor, color: "bg-success" },
    { label: "Against", value: proposal.votesAgainst, color: "bg-danger" },
    { label: "Abstain", value: proposal.votesAbstain, color: "bg-muted" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        {rows.map((r) => (
          <div key={r.label} className={r.color} style={{ width: `${percentOf(r.value, total)}%` }} />
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className={`size-2 rounded-full ${r.color}`} />
              {r.label}
            </dt>
            <dd className="tabular-nums">
              {r.value.toLocaleString("en-US")}{" "}
              <span className="text-xs text-muted">({percentOf(r.value, total).toFixed(1)}%)</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ProposalCard({ address, proposal, now }: { address: string; proposal: Proposal; now: number }) {
  const phase = proposalPhase(proposal, now);
  const href = safeHref(proposal.descriptionUri);
  const endsIn = Number(proposal.votingEndsAt) - now;
  const startsIn = Number(proposal.votingStartsAt) - now;
  return (
    <li className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">Proposal #{proposal.id.toString()}</p>
          <h2 className="text-lg font-semibold break-words">{proposal.title || "Untitled proposal"}</h2>
          <p className="text-xs text-muted">
            by <AddressLink address={proposal.proposer} /> · account <AddressLink address={address} />
          </p>
        </div>
        <span className={`badge ${STATUS_STYLE[phase.kind] ?? ""}`}>{phase.label}</span>
      </div>
      <Tally proposal={proposal} />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>Starts {formatUnixTime(proposal.votingStartsAt)}</span>
        <span>Ends {formatUnixTime(proposal.votingEndsAt)}</span>
        {now > 0 && phase.kind === "voting" && <span>{formatDuration(endsIn)} left</span>}
        {now > 0 && phase.kind === "upcoming" && <span>opens in {formatDuration(startsIn)}</span>}
      </div>
      {proposal.descriptionUri &&
        (href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline underline-offset-4">
            Read full description
          </a>
        ) : (
          <p className="text-xs break-all text-muted">Description: {proposal.descriptionUri}</p>
        ))}
    </li>
  );
}

export function GovernanceView() {
  const query = useRpcQuery("proposals", fetchProposals);
  const now = useNow();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Governance</h1>
        <p className="max-w-2xl text-muted">
          Parameter-change proposals and their token-weighted vote tallies from governance program{" "}
          <AddressLink address={config.governanceProgramId} />.
        </p>
      </section>
      {query.status === "loading" || query.status === "idle" ? (
        <LoadingGrid count={2} label="Loading proposals" />
      ) : query.status === "error" ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.data.accounts.length === 0 ? (
        <>
          <EmptyState title="No proposals yet">
            The governance program has no Proposal accounts on {config.cluster} (it may not be
            deployed to this cluster yet).
          </EmptyState>
          <SkippedNotice skipped={query.data.skipped} />
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {query.data.accounts.map((a) => (
              <ProposalCard key={a.address} address={a.address} proposal={a.data} now={now} />
            ))}
          </ul>
          <SkippedNotice skipped={query.data.skipped} />
        </>
      )}
    </div>
  );
}

