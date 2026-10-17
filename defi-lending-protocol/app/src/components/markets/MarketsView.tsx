"use client";

import { useState } from "react";
import type { Market } from "@/lib/accounts";
import { config } from "@/lib/config";
import { formatBps, formatUnits, shortenAddress } from "@/lib/format";
import { fetchMarkets, fetchProtocols } from "@/lib/queries";
import { marketRates } from "@/lib/rates";
import type { DecodedAccount } from "@/lib/rpc";
import { useRpcQuery } from "@/hooks/useRpcQuery";
import { AddressLink } from "../ui/AddressLink";
import { EmptyState, ErrorState, LoadingGrid, SkippedNotice } from "../ui/States";
import { RateModelChart } from "./RateModelChart";

function pairLabel(m: Market) {
  return `${shortenAddress(m.collateralMint)} / ${shortenAddress(m.loanMint)}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums" title={hint}>
        {value}
      </dd>
    </div>
  );
}

function UtilizationBar({ bps }: { bps: number }) {
  return (
    <div
      role="meter"
      aria-label="Utilization"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bps / 100}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${bps / 100}%` }} />
    </div>
  );
}

function MarketCard({
  item,
  selected,
  onSelect,
}: {
  item: DecodedAccount<Market>;
  selected: boolean;
  onSelect: () => void;
}) {
  const m = item.data;
  const rates = marketRates(m);
  return (
    <article
      className={`card flex flex-col gap-4 transition ${selected ? "ring-2 ring-accent" : ""}`}
      aria-labelledby={`market-${item.address}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 id={`market-${item.address}`} className="font-mono text-sm font-semibold">
            {pairLabel(m)}
          </h3>
          <p className="text-xs text-muted">
            collateral / loan · market <AddressLink address={item.address} />
          </p>
        </div>
        {m.paused ? (
          <span className="badge bg-warning/15 text-warning">Paused</span>
        ) : (
          <span className="badge bg-success/15 text-success">Active</span>
        )}
      </header>
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Total supplied" value={formatUnits(m.totalDeposits, m.loanDecimals, 2)} />
        <Stat label="Total borrowed" value={formatUnits(m.totalBorrows, m.loanDecimals, 2)} />
        <Stat label="Supply APR" value={formatBps(rates.supplyRateBps)} />
        <Stat label="Borrow APR" value={formatBps(rates.borrowRateBps)} />
        <Stat
          label="LTV / Liq. threshold"
          value={`${formatBps(m.config.ltvBps, 0)} / ${formatBps(m.config.liquidationThresholdBps, 0)}`}
        />
        <Stat label="Reserves" value={formatUnits(m.totalReserves, m.loanDecimals, 2)} />
      </dl>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-muted">
          <span>Utilization</span>
          <span className="tabular-nums">{formatBps(rates.utilizationBps)}</span>
        </div>
        <UtilizationBar bps={rates.utilizationBps} />
      </div>
      <button type="button" className="btn-secondary self-start" onClick={onSelect} aria-pressed={selected}>
        {selected ? "Showing rate model" : "View rate model"}
      </button>
    </article>
  );
}

export function MarketsView() {
  const markets = useRpcQuery("markets", fetchMarkets);
  const protocols = useRpcQuery("protocols", fetchProtocols);
  const [selected, setSelected] = useState<string | null>(null);

  const protocol = protocols.status === "success" ? protocols.data.accounts[0]?.data : undefined;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Markets</h1>
        <p className="max-w-2xl text-muted">
          Isolated collateral/loan markets with a kinked interest-rate model. Data is read live from
          program <AddressLink address={config.lendingProgramId} /> on {config.cluster}; no wallet
          needed.
        </p>
        {protocol && (
          <p className="text-sm text-muted">
            Protocol: {protocol.marketCount.toString()} market{protocol.marketCount === 1n ? "" : "s"}{" "}
            registered · admin <AddressLink address={protocol.admin} />
            {protocol.paused && <span className="badge ml-2 bg-warning/15 text-warning">Protocol paused</span>}
          </p>
        )}
      </section>

      {markets.status === "loading" || markets.status === "idle" ? (
        <LoadingGrid label="Loading markets" />
      ) : markets.status === "error" ? (
        <ErrorState error={markets.error} onRetry={markets.refetch} />
      ) : markets.data.accounts.length === 0 ? (
        <>
          <EmptyState title="No markets found">
            The lending program has no Market accounts on {config.cluster} yet (it may not be
            deployed to this cluster). Deploy it and create a market, or point{" "}
            <code className="font-mono">NEXT_PUBLIC_RPC_URL</code> at a cluster where it exists.
          </EmptyState>
          <SkippedNotice skipped={markets.data.skipped} />
        </>
      ) : (
        <MarketsContent
          accounts={markets.data.accounts}
          skipped={markets.data.skipped}
          selected={selected}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}

function MarketsContent({
  accounts,
  skipped,
  selected,
  onSelect,
}: {
  accounts: DecodedAccount<Market>[];
  skipped: number;
  selected: string | null;
  onSelect: (address: string) => void;
}) {
  const active = accounts.find((a) => a.address === selected) ?? accounts[0];
  return (
    <>
      <section aria-label="Market list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((item) => (
          <MarketCard
            key={item.address}
            item={item}
            selected={item.address === active?.address}
            onSelect={() => onSelect(item.address)}
          />
        ))}
      </section>
      <SkippedNotice skipped={skipped} />
      {active && (
        <section className="card flex flex-col gap-4" aria-labelledby="rate-model-heading">
          <div>
            <h2 id="rate-model-heading" className="text-xl font-semibold">
              Rate model · <span className="font-mono text-base">{pairLabel(active.data)}</span>
            </h2>
            <p className="text-sm text-muted">
              Borrow APR rises linearly by slope1 up to the optimal utilization (the kink), then
              steeply by slope2 to discourage draining liquidity. Suppliers earn the borrow APR
              scaled by utilization, minus the {formatBps(active.data.config.reserveFactorBps, 0)}{" "}
              reserve factor.
            </p>
          </div>
          <RateModelChart
            model={active.data.config.rateModel}
            reserveFactorBps={active.data.config.reserveFactorBps}
            currentUtilizationBps={marketRates(active.data).utilizationBps}
            title={`Rate model for ${pairLabel(active.data)}`}
          />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Base rate" value={formatBps(active.data.config.rateModel.baseRateBps)} />
            <Stat label="Slope 1" value={formatBps(active.data.config.rateModel.slope1Bps)} />
            <Stat label="Slope 2" value={formatBps(active.data.config.rateModel.slope2Bps)} />
            <Stat
              label="Optimal utilization"
              value={formatBps(active.data.config.rateModel.optimalUtilizationBps, 0)}
            />
          </dl>
        </section>
      )}
    </>
  );
}
