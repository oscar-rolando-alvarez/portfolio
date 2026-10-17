"use client";

import { useState } from "react";
import type { Listing, Offer } from "@/lib/accounts";
import { config } from "@/lib/config";
import { formatDuration, formatUnixTime, lamportsToSol, shortenAddress } from "@/lib/format";
import { isListingActive } from "@/lib/market";
import { fetchListingsWithOffers } from "@/lib/queries";
import type { DecodedAccount } from "@/lib/rpc";
import { useNow } from "@/hooks/useNow";
import { useRpcQuery } from "@/hooks/useRpcQuery";
import { NftArt } from "../nft/NftArt";
import { AddressLink } from "../ui/AddressLink";
import { EmptyState, ErrorState, LoadingGrid, SkippedNotice } from "../ui/States";
import { useWalletSelection } from "../wallet/WalletProvider";

type SortKey = "newest" | "price-asc" | "price-desc";

function bestOffers(offers: DecodedAccount<Offer>[], now: number): Map<string, { best: bigint; count: number }> {
  const map = new Map<string, { best: bigint; count: number }>();
  for (const { data } of offers) {
    if (now > 0 && data.expiresAt !== 0n && data.expiresAt <= BigInt(now)) continue;
    const cur = map.get(data.mint);
    map.set(data.mint, {
      best: cur && cur.best > data.amount ? cur.best : data.amount,
      count: (cur?.count ?? 0) + 1,
    });
  }
  return map;
}

function sortListings(items: DecodedAccount<Listing>[], key: SortKey) {
  if (key === "newest") return items;
  const dir = key === "price-asc" ? 1 : -1;
  return items.toSorted((a, b) => (a.data.price === b.data.price ? 0 : a.data.price > b.data.price ? dir : -dir));
}

function ListingCard({
  item,
  now,
  offer,
}: {
  item: DecodedAccount<Listing>;
  now: number;
  offer: { best: bigint; count: number } | undefined;
}) {
  const l = item.data;
  const expiresIn = Number(l.expiresAt) - now;
  return (
    <li className="card flex flex-col gap-3 p-3">
      <NftArt mint={l.mint} label={`Generated artwork for mint ${shortenAddress(l.mint)}`} />
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-sm font-semibold" title={l.mint}>
            {shortenAddress(l.mint, 5)}
          </h3>
          <p className="text-xs text-muted">
            Seller <AddressLink address={l.seller} />
          </p>
        </div>
        <p className="text-right">
          <span className="block text-lg font-semibold tabular-nums">{lamportsToSol(l.price)}</span>
          <span className="text-xs text-muted">SOL</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-2 text-xs text-muted">
        <span title={l.expiresAt === 0n ? undefined : formatUnixTime(l.expiresAt)}>
          {l.expiresAt === 0n
            ? "No expiry"
            : now > 0
              ? `Expires in ${formatDuration(expiresIn)}`
              : `Expires ${formatUnixTime(l.expiresAt)}`}
        </span>
        {offer && (
          <span>
            Best offer {lamportsToSol(offer.best)} SOL ({offer.count})
          </span>
        )}
      </div>
    </li>
  );
}

export function ListingsView() {
  const query = useRpcQuery("listings", fetchListingsWithOffers);
  const now = useNow();
  const [sort, setSort] = useState<SortKey>("newest");
  const [showExpired, setShowExpired] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const { account } = useWalletSelection();
  const mine = onlyMine && account ? account.address : null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="listings-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="listings-heading" className="text-2xl font-semibold tracking-tight">
          Explore listings
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {account && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="size-4 accent-accent"
              />
              Only my listings
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
              className="size-4 accent-accent"
            />
            Show expired
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-full border border-border bg-surface px-3 py-1.5"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
        </div>
      </div>

      {query.status === "loading" || query.status === "idle" ? (
        <LoadingGrid count={4} label="Loading listings" />
      ) : query.status === "error" ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        (() => {
          const visible = sortListings(
            query.data.listings.accounts.filter(
              (a) => (showExpired || isListingActive(a.data, now)) && (!mine || a.data.seller === mine),
            ),
            sort,
          );
          const offers = bestOffers(query.data.offers.accounts, now);
          return (
            <>
              {visible.length === 0 ? (
                <EmptyState title="No active listings">
                  {mine
                    ? "The connected wallet has no matching listings."
                    : query.data.listings.accounts.length > 0
                    ? "All listings have expired. Toggle “Show expired” to see them."
                    : `The marketplace program has no Listing accounts on ${config.cluster} (it may not be deployed to this cluster yet).`}
                </EmptyState>
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {visible.map((item) => (
                    <ListingCard key={item.address} item={item} now={now} offer={offers.get(item.data.mint)} />
                  ))}
                </ul>
              )}
              <SkippedNotice skipped={query.data.listings.skipped + query.data.offers.skipped} />
            </>
          );
        })()
      )}
    </section>
  );
}
