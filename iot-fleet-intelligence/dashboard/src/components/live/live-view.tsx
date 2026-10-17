"use client";

import { Activity, Antenna, Cpu, Globe2, Radar, Router, SignalHigh, Waves } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AnomalyTimeline, HistogramChart, HorizontalBars, ThroughputChart } from "@/components/charts/lazy";
import { TimeRangeControl } from "@/components/shell/controls";
import { PageHeader } from "@/components/shell/app-shell";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Badge, Card, CardHeader, cn, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { formatBytesPerSec, formatNumber, formatPercent } from "@/lib/format";
import { windowed } from "@/lib/stream/reducer";
import type { DimStat } from "@/lib/stream/types";
import { useStore } from "@/lib/store";

function Stat({ label, children, icon }: { label: string; children: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-5 py-4">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-3 [&_svg]:size-4">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-fg-3">{label}</p>
        <div className="text-xl font-semibold tracking-[-0.02em] text-fg">{children}</div>
      </div>
    </div>
  );
}

function HealthBar({ value }: { value: number }) {
  const tone = value >= 0.9 ? "bg-good" : value >= 0.6 ? "bg-warning" : "bg-critical";
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(4, value * 100)}%` }} />
      </span>
      <span className="w-10 text-right tabular">{Math.round(value * 100)}</span>
    </span>
  );
}

function DimTable({
  title,
  rows,
  icon,
  metric,
  linkCells,
}: {
  title: string;
  rows: DimStat[];
  icon: ReactNode;
  metric: "fail" | "reset";
  linkCells?: boolean;
}) {
  const t = useTranslations("live");
  const locale = useLocale();
  return (
    <Card aria-label={title}>
      <CardHeader title={title} icon={icon} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-y border-border bg-surface-2/60 text-fg-3">
            <tr>
              <th scope="col" className="px-5 py-2 text-left font-medium">
                {t("colScope")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("colEvents")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {metric === "fail" ? t("colFail") : t("colReset")}
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                {t("colHealth")}
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={r.key} className={cn("border-b border-border last:border-0", r.anomaly >= 0.3 && "bg-critical-soft/50")}>
                <td className="px-5 py-2">
                  <span className="flex items-center gap-2">
                    {r.anomaly >= 0.3 ? (
                      <span role="img" className="size-1.5 animate-pulse rounded-full bg-critical" aria-label={t("colAnomaly")} />
                    ) : (
                      <span className="size-1.5" />
                    )}
                    {linkCells ? (
                      <Link
                        href={{ pathname: "/map", query: { cell: r.key } }}
                        className="font-mono text-fg-2 hover:text-accent hover:underline"
                      >
                        {r.key}
                      </Link>
                    ) : (
                      <span className="font-mono text-fg-2">{r.key}</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-fg-2">{formatNumber(locale, r.events)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right",
                    (metric === "fail" ? r.failRatio : r.resetRatio) > 0.1 ? "font-semibold text-critical" : "text-fg-2",
                  )}
                >
                  {formatPercent(locale, metric === "fail" ? r.failRatio : r.resetRatio, 1)}
                </td>
                <td className="px-5 py-2 text-fg-2">
                  <HealthBar value={r.health} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState title={t("noAnomalies")} /> : null}
      </div>
    </Card>
  );
}

export function LiveView() {
  const t = useTranslations("live");
  const ti = useTranslations("incidents");
  const tc = useTranslations("common");
  const locale = useLocale();
  const stream = useStore((s) => s.stream);
  const range = useStore((s) => s.timeRange);
  const s = stream.latest;
  const hist = windowed(stream.history, range);
  const rat = s ? Object.entries(s.ratMix).sort((a, b) => b[1] - a[1]) : [];
  const ratTotal = rat.reduce((acc, [, v]) => acc + v, 0) || 1;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<TimeRangeControl />} />

      <Card className="grid grid-cols-2 divide-border max-md:[&>*:nth-child(-n+2)]:border-b md:grid-cols-4 md:divide-x">
        <Stat label={t("eventsPerSec")} icon={<Activity />}>
          {s ? <NumberTicker value={s.eventsPerSec} format={(v) => formatNumber(locale, v)} /> : <Skeleton className="h-7 w-24" />}
        </Stat>
        <Stat label={t("bytesPerSec")} icon={<Waves />}>
          {s ? formatBytesPerSec(locale, s.bytesPerSec) : <Skeleton className="h-7 w-24" />}
        </Stat>
        <Stat label={t("latency")} icon={<Router />}>
          {s ? `${formatNumber(locale, s.latencyMs)} ms` : <Skeleton className="h-7 w-24" />}
        </Stat>
        <Stat label={t("connectedNow")} icon={<SignalHigh />}>
          {s ? <NumberTicker value={s.connected} format={(v) => formatNumber(locale, v)} /> : <Skeleton className="h-7 w-24" />}
        </Stat>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card aria-labelledby="live-throughput">
          <CardHeader id="live-throughput" title={t("throughput")} subtitle={t("throughputSub")} icon={<Activity className="size-3.5" />} />
          <div className="px-3 pb-3">
            {s ? (
              <ThroughputChart points={hist} markers={stream.markers} ariaLabel={t("throughput")} seriesName={t("eventsPerSec")} />
            ) : (
              <Skeleton className="m-2 h-60" />
            )}
          </div>
        </Card>
        <Card aria-labelledby="live-anomaly">
          <CardHeader
            id="live-anomaly"
            title={t("anomalyTimeline")}
            subtitle={t("anomalyTimelineSub")}
            icon={<Radar className="size-3.5" />}
            actions={
              s && s.anomalies.length ? <Badge tone="critical">{ti(`fault.${s.anomalies[0]!.kind}`)}</Badge> : <Badge tone="good">OK</Badge>
            }
          />
          <div className="px-3 pb-3">
            {s ? (
              <AnomalyTimeline
                points={hist}
                markers={stream.markers}
                height={260}
                labels={{
                  score: t("anomalyScore"),
                  signal: t("liveSignal"),
                  incident: t("confirmed"),
                  aria: t("anomalyTimeline"),
                  fault: (k) => ti(`fault.${k}` as "fault.cell_outage"),
                }}
              />
            ) : (
              <Skeleton className="m-2 h-60" />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card aria-labelledby="live-rsrp">
          <CardHeader id="live-rsrp" title={t("rsrp")} subtitle={t("rsrpSub")} icon={<Antenna className="size-3.5" />} />
          <div className="px-3 pb-3">
            {s ? <HistogramChart hist={s.rsrp} unit="dBm" ariaLabel={t("rsrp")} /> : <Skeleton className="m-2 h-48" />}
          </div>
        </Card>
        <Card aria-labelledby="live-sinr">
          <CardHeader id="live-sinr" title={t("sinr")} subtitle={t("sinrSub")} icon={<SignalHigh className="size-3.5" />} />
          <div className="px-3 pb-3">
            {s ? <HistogramChart hist={s.sinr} unit="dB" ariaLabel={t("sinr")} color={2} /> : <Skeleton className="m-2 h-48" />}
          </div>
        </Card>
        <Card aria-labelledby="live-rat" className="md:col-span-2 xl:col-span-1">
          <CardHeader id="live-rat" title={t("ratMix")} subtitle={t("ratMixSub")} icon={<Globe2 className="size-3.5" />} />
          <div className="px-4 pb-4">
            {s ? (
              <HorizontalBars
                rows={rat.map(([k, v]) => ({ label: k, value: v / ratTotal }))}
                format={(v) => formatPercent(locale, v, 1)}
                ariaLabel={t("ratMix")}
                colorIndex={3}
              />
            ) : (
              <Skeleton className="h-32" />
            )}
            {s ? <p className="mt-2 text-[11px] text-fg-3">{t("sampled", { sampled: formatNumber(locale, s.sampledEvents) })}</p> : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <DimTable title={t("topCells")} rows={s?.topCells ?? []} icon={<Router className="size-3.5" />} metric="fail" linkCells />
        <DimTable title={t("topFirmware")} rows={s?.topFirmware ?? []} icon={<Cpu className="size-3.5" />} metric="reset" />
        <DimTable title={t("topCarriers")} rows={s?.topCarriers ?? []} icon={<Globe2 className="size-3.5" />} metric="fail" />
        <DimTable title={t("topApns")} rows={s?.topApns ?? []} icon={<Waves className="size-3.5" />} metric="fail" />
      </div>
      {!s ? <p className="mt-4 text-center text-xs text-fg-3">{tc("noDataBody")}</p> : null}
    </>
  );
}
