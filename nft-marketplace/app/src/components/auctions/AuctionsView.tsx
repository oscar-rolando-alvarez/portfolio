"use client";

import type { Auction } from "@/lib/accounts";
import { config } from "@/lib/config";
import { formatBps, formatDuration, formatUnixTime, lamportsToSol, shortenAddress } from "@/lib/format";
import { type AuctionPhase, auctionPhase, hasBids, nextMinimumBid } from "@/lib/market";
import { fetchAuctions } from "@/lib/queries";
import type { DecodedAccount } from "@/lib/rpc";
import { useNow } from "@/hooks/useNow";
import { useRpcQuery } from "@/hooks/useRpcQuery";
import { NftArt } from "../nft/NftArt";
import { AddressLink } from "../ui/AddressLink";
import { EmptyState, ErrorState, LoadingGrid, SkippedNotice } from "../ui/States";

const PHASE_BADGE: Record<AuctionPhase, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-emerald-600 text-white" },
  upcoming: { label: "Upcoming", className: "bg-violet-600 text-white" },
  ended: { label: "Ended", className: "bg-black/60 text-white" },
};

function Countdown({ auction, now }: { auction: Auction; now: number }) {
  if (now <= 0) return <span>Ends {formatUnixTime(auction.endsAt)}</span>;
  const phase = auctionPhase(auction, now);
  if (phase === "upcoming") return <span>Starts in {formatDuration(Number(auction.startsAt) - now)}</span>;
  if (phase === "ended") return <span>Ended {formatUnixTime(auction.endsAt)}</span>;
  return (
    <span className="font-medium text-fg" aria-live="off">
      Ends in <span className="tabular-nums">{formatDuration(Number(auction.endsAt) - now)}</span>
    </span>
  );
}

function AuctionCard({ item, now }: { item: DecodedAccount<Auction>; now: number }) {
  const a = item.data;
  const phase = auctionPhase(a, now);
  const badge = PHASE_BADGE[phase];
  const bids = hasBids(a);
  return (
    <li className="card flex flex-col gap-3 p-3">
      <div className="relative">
        <NftArt mint={a.mint} label={`Generated artwork for mint ${shortenAddress(a.mint)}`} />
        <span className={`badge absolute top-2 right-2 shadow ${badge.className}`}>{badge.label}</span>
      </div>
      <div className="flex flex-col gap-1 px-1">
        <h3 className="font-mono text-sm font-semibold" title={a.mint}>
          {shortenAddress(a.mint, 5)}
        </h3>
        <p className="text-xs text-muted">
          Seller <AddressLink address={a.seller} />
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 px-1 text-sm">
        <div>
          <dt className="text-xs text-muted">{bids ? "Highest bid" : "Reserve"}</dt>
          <dd className="font-semibold tabular-nums">{lamportsToSol(bids ? a.highestBid : a.minBid)} SOL</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Next minimum bid</dt>
          <dd className="font-semibold tabular-nums">{lamportsToSol(nextMinimumBid(a))} SOL</dd>
        </div>
        <div className="col-span-2 text-xs text-muted">
          {bids ? (
            <>
              Leader <AddressLink address={a.highestBidder} /> · min increment {formatBps(a.minIncrementBps)}
            </>
          ) : (
            <>No bids yet · min increment {formatBps(a.minIncrementBps)}</>
          )}
        </div>
      </dl>
      <div className="border-t border-border px-1 pt-2 text-xs text-muted">
        <Countdown auction={a} now={now} />
      </div>
    </li>
  );
}

export function AuctionsView() {
  const query = useRpcQuery("auctions", fetchAuctions);
  const now = useNow();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Live auctions</h1>
        <p className="max-w-2xl text-muted">
          English auctions from program <AddressLink address={config.auctionProgramId} />. Each new
          bid must beat the current highest bid by the auction&apos;s minimum increment.
        </p>
      </section>
      {query.status === "loading" || query.status === "idle" ? (
        <LoadingGrid count={3} label="Loading auctions" />
      ) : query.status === "error" ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.data.accounts.length === 0 ? (
        <>
          <EmptyState title="No auctions">
            The auction program has no Auction accounts on {config.cluster} (it may not be deployed
            to this cluster yet).
          </EmptyState>
          <SkippedNotice skipped={query.data.skipped} />
        </>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.accounts
              .toSorted((x, y) => phaseRank(auctionPhase(x.data, now)) - phaseRank(auctionPhase(y.data, now)))
              .map((item) => (
                <AuctionCard key={item.address} item={item} now={now} />
              ))}
          </ul>
          <SkippedNotice skipped={query.data.skipped} />
        </>
      )}
    </div>
  );
}

function phaseRank(phase: AuctionPhase): number {
  return phase === "live" ? 0 : phase === "upcoming" ? 1 : 2;
}
