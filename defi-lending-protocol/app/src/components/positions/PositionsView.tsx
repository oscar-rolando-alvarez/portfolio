"use client";

import type { Address } from "@solana/kit";
import { config } from "@/lib/config";
import { formatBps, formatUnits, shortenAddress } from "@/lib/format";
import { fetchMarkets, fetchPositionsByOwner } from "@/lib/queries";
import { currentDebt } from "@/lib/rates";
import { useRpcQuery } from "@/hooks/useRpcQuery";
import { AddressLink } from "../ui/AddressLink";
import { EmptyState, ErrorState, LoadingGrid, SkippedNotice } from "../ui/States";
import { useWalletSelection } from "../wallet/WalletProvider";

async function fetchPositionsWithMarkets(owner: Address) {
  const [positions, markets] = await Promise.all([fetchPositionsByOwner(owner), fetchMarkets()]);
  const byAddress = new Map(markets.accounts.map((m) => [m.address, m.data]));
  return {
    skipped: positions.skipped,
    rows: positions.accounts.map((p) => ({ ...p, market: byAddress.get(p.data.market) })),
  };
}

export function PositionsView() {
  const { account } = useWalletSelection();
  const owner = account?.address as Address | undefined;
  const query = useRpcQuery(owner ? `positions:${owner}` : null, () =>
    owner ? fetchPositionsWithMarkets(owner) : Promise.reject(new Error("No wallet connected")),
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">My positions</h1>
        <p className="max-w-2xl text-muted">
          Collateral deposited and debt owed by the connected wallet across all markets. Debt
          includes accrued interest up to each market&apos;s last accrual.
        </p>
      </section>

      {!owner ? (
        <EmptyState title="Connect a wallet to see your positions">
          Positions are looked up by owner address. Connecting is read-only here: nothing is
          signed.
        </EmptyState>
      ) : query.status === "loading" || query.status === "idle" ? (
        <LoadingGrid count={2} label="Loading positions" />
      ) : query.status === "error" ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.data.rows.length === 0 ? (
        <EmptyState title="No positions">
          The wallet <span className="font-mono">{shortenAddress(owner)}</span> has no Position
          accounts on {config.cluster}.
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2">
            {query.data.rows.map((row) => {
              const m = row.market;
              const debt = m ? currentDebt(row.data.borrowScaled, m.borrowIndex) : null;
              return (
                <li key={row.address} className="card flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-mono text-sm font-semibold">
                        {m
                          ? `${shortenAddress(m.collateralMint)} / ${shortenAddress(m.loanMint)}`
                          : "Unknown market"}
                      </h2>
                      <p className="text-xs text-muted">
                        position <AddressLink address={row.address} /> · market{" "}
                        <AddressLink address={row.data.market} />
                      </p>
                    </div>
                    {m?.paused && <span className="badge bg-warning/15 text-warning">Market paused</span>}
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs text-muted">Collateral</dt>
                      <dd className="font-semibold tabular-nums">
                        {m ? formatUnits(row.data.collateralAmount, m.collateralDecimals) : row.data.collateralAmount.toString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Debt</dt>
                      <dd className="font-semibold tabular-nums">
                        {m && debt !== null ? formatUnits(debt, m.loanDecimals) : "—"}
                      </dd>
                    </div>
                    {m && (
                      <>
                        <div>
                          <dt className="text-xs text-muted">Max LTV</dt>
                          <dd className="tabular-nums">{formatBps(m.config.ltvBps, 0)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Liquidation threshold</dt>
                          <dd className="tabular-nums">{formatBps(m.config.liquidationThresholdBps, 0)}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                  <p className="text-xs text-muted">
                    Health factor needs Pyth oracle prices for both mints and is not computed in this
                    read-only view.
                  </p>
                </li>
              );
            })}
          </ul>
          <SkippedNotice skipped={query.data.skipped} />
        </>
      )}
    </div>
  );
}
