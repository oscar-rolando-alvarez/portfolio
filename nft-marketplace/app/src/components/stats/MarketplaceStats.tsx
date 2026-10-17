"use client";

import { config } from "@/lib/config";
import { formatBps, lamportsToSol } from "@/lib/format";
import { fetchMarketplaces } from "@/lib/queries";
import { useRpcQuery } from "@/hooks/useRpcQuery";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

export function MarketplaceStats() {
  const query = useRpcQuery("marketplace", fetchMarketplaces);

  if (query.status === "loading" || query.status === "idle") {
    return (
      <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <span className="sr-only">Loading marketplace stats…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-surface-muted" />
        ))}
      </div>
    );
  }
  if (query.status === "error") {
    return (
      <p role="alert" className="text-sm text-muted">
        Marketplace stats unavailable: {query.error.message}{" "}
        <button type="button" className="underline" onClick={query.refetch}>
          Retry
        </button>
      </p>
    );
  }
  const mp = query.data.accounts[0]?.data;
  if (!mp) {
    return (
      <p className="text-sm text-muted">
        No Marketplace account found on {config.cluster}; the program may not be initialized on this
        cluster yet.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Marketplace stats">
      <Tile label="Total volume" value={`${lamportsToSol(mp.totalVolume, 2)} SOL`} />
      <Tile label="Sales" value={mp.totalSales.toLocaleString("en-US")} />
      <Tile
        label="Marketplace fee"
        value={formatBps(mp.feeBps)}
        sub={mp.paused ? "Trading is currently paused" : "Taken from each sale"}
      />
    </dl>
  );
}
