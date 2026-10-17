"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Activity, BadgeDollarSign, Bot, Clock, Cpu, Gauge, ShieldCheck, SlidersHorizontal, Siren, Truck, Wifi, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { ThroughputChart } from "@/components/charts/lazy";
import { PageHeader } from "@/components/shell/app-shell";
import { IncidentRow } from "@/components/incidents/incident-row";
import { KpiTile, type KpiDelta } from "@/components/ui/kpi-tile";
import { Badge, Button, Card, CardHeader, cn, EmptyState, Skeleton } from "@/components/ui/primitives";
import { downsample } from "@/components/ui/sparkline";
import { Link } from "@/i18n/navigation";
import { formatCompact, formatDuration, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { useFleetSize, useNow } from "@/lib/hooks";
import { activeBySeverity, sortedIncidents, windowed } from "@/lib/stream/reducer";
import { useStore } from "@/lib/store";
import { demoTenant } from "@/lib/stream/demo";
import { DEFAULT_ASSUMPTIONS, meanDetectionLead, meanTimeToRemediate, monthlySla, valueSummary, type Assumptions } from "@/lib/value";

function delta(
  locale: string,
  now: number,
  before: number | undefined,
  higherIsGood: boolean,
  label: string,
  pct = true,
): KpiDelta | undefined {
  if (before === undefined || !Number.isFinite(before) || before === 0) return undefined;
  const d = pct ? (now - before) / Math.abs(before) : now - before;
  const flat = Math.abs(d) < (pct ? 0.0005 : 0.5);
  return {
    value: pct ? formatPercent(locale, Math.abs(d), Math.abs(d) < 0.01 ? 2 : 1) : formatNumber(locale, Math.abs(d)),
    direction: flat ? "flat" : d > 0 ? "up" : "down",
    good: flat ? true : d > 0 === higherIsGood,
    label,
  };
}

/** Renders "<b>…</b>" rich text from the catalog without dangerouslySetInnerHTML. */
const bold = (chunks: ReactNode) => <strong className="font-semibold text-fg">{chunks}</strong>;

export function Overview() {
  const t = useTranslations("overview");
  const tc = useTranslations("common");
  const locale = useLocale();
  const stream = useStore((s) => s.stream);
  const currency = useStore((s) => s.currency);
  const assumptions = useStore((s) => s.assumptions);
  const actions = useStore((s) => s.actions);
  const range = useStore((s) => s.timeRange);
  const devices = useFleetSize();
  const now = useNow(5000);
  const loading = !stream.latest;

  const incidents = useMemo(() => sortedIncidents(stream), [stream]);
  const value = useMemo(() => valueSummary(devices, assumptions, now, incidents), [devices, assumptions, now, incidents]);
  const hist = windowed(stream.history, range);
  const ago = stream.history.at(-301);
  const latest = stream.latest;
  const sev = activeBySeverity(stream);
  const activeTotal = sev.critical + sev.high + sev.medium + sev.low;
  const mttd = meanDetectionLead(incidents);
  const mode = useStore((s) => s.mode);
  const tenant = useStore((s) => s.tenant);
  // month-to-date figures before this session: a labelled seed in demo mode, none in live mode
  const baseline = mode === "demo" ? demoTenant(tenant).baseline : null;
  const mttr = meanTimeToRemediate(incidents, actions, baseline);
  const sla = now ? monthlySla(stream.history, assumptions.slaAvailabilityTarget, now, baseline) : null;
  const scopeNote = baseline ? t("mtdDemo") : t("mtdLive");
  const money = (usd: number, compact = true) => formatMoney(locale, usd, currency, { compact, copPerUsd: assumptions.copPerUsd });
  const vsLabel = tc("vsAgo", { minutes: 5 });

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<AssumptionsDialog />} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          testId="kpi-availability"
          label={t("availability")}
          icon={<Wifi />}
          loading={loading}
          value={latest?.availability}
          format={(v) => formatPercent(locale, v, 2)}
          delta={latest ? delta(locale, latest.availability, ago?.availability, true, vsLabel) : undefined}
          spark={downsample(hist.map((p) => p.availability))}
          sparkColor="var(--good)"
          footnote={t("availabilityFoot")}
        />
        <KpiTile
          testId="kpi-online"
          label={t("online")}
          icon={<Activity />}
          loading={loading}
          value={latest?.devicesOnline}
          format={(v) => formatNumber(locale, v)}
          delta={latest ? delta(locale, latest.devicesOnline, ago?.devicesOnline, true, vsLabel) : undefined}
          spark={downsample(hist.map((p) => p.devicesOnline))}
          footnote={t("onlineFoot", { seen: formatCompact(locale, latest?.devicesSeen ?? 0) })}
        />
        <KpiTile
          testId="kpi-incidents"
          label={t("activeIncidents")}
          icon={<Siren />}
          loading={loading}
          display={
            <div className="flex items-baseline gap-3">
              <span className="tabular">{activeTotal}</span>
              <div className="flex flex-wrap gap-1">
                {activeTotal === 0 ? <Badge tone="good">{t("noActive")}</Badge> : null}
                {(["critical", "high", "medium", "low"] as const).map((k) =>
                  sev[k] ? (
                    <Badge key={k} tone={k === "critical" ? "critical" : k === "high" ? "serious" : k === "medium" ? "warning" : "neutral"}>
                      {sev[k]} {t(`severity.${k}`)}
                    </Badge>
                  ) : null,
                )}
              </div>
            </div>
          }
          spark={downsample(hist.map((p) => p.anomalyScore))}
          sparkColor="var(--serious)"
        />
        <KpiTile
          testId="kpi-sla"
          label={t("sla")}
          icon={<ShieldCheck />}
          loading={loading || !sla}
          hint={t("slaHint", { target: formatPercent(locale, assumptions.slaAvailabilityTarget, 1) })}
          display={
            sla ? (
              <div className="flex items-baseline gap-3">
                <span className="tabular">{formatPercent(locale, sla.availability, 2)}</span>
                <Badge tone={sla.within ? "good" : "critical"}>{sla.within ? t("slaWithin") : t("slaBreach")}</Badge>
              </div>
            ) : undefined
          }
          footnote={
            sla
              ? `${t("slaFoot", {
                  target: formatPercent(locale, sla.target, 1),
                  budget: formatPercent(locale, sla.budgetUsed, 0),
                  recent: sla.recent === null ? "—" : formatPercent(locale, sla.recent, 2),
                })} · ${scopeNote}`
              : undefined
          }
        />
        <KpiTile
          testId="kpi-mttd"
          label={t("mttd")}
          icon={<Gauge />}
          loading={loading}
          display={mttd === null ? "—" : formatDuration(locale, mttd)}
          footnote={t("mttdFoot")}
        />
        <KpiTile
          testId="kpi-mttr"
          label={t("mttr")}
          icon={<Clock />}
          loading={loading}
          display={mttr === null ? "—" : formatDuration(locale, mttr)}
          hint={t("mttrHint")}
          footnote={`${t("mttrFoot")} · ${scopeNote}`}
        />
        <KpiTile
          testId="kpi-truckrolls"
          loading={!now}
          label={t("truckRolls")}
          icon={<Truck />}
          value={value.truckRollsAvoided}
          format={(v) => formatNumber(locale, v, 0)}
          footnote={t("truckRollsFoot", { saved: money(value.savingsUsd) })}
          className="ring-1 ring-good/25"
        />
        <KpiTile
          testId="kpi-cost"
          label={t("costPerDevice")}
          icon={<Cpu />}
          display={formatMoney(locale, value.costPerDeviceUsd, currency, { precise: true, copPerUsd: assumptions.copPerUsd })}
          footnote={t("costPerDeviceFoot", { total: money(value.platformCostUsd), devices: formatCompact(locale, devices) })}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ValueCard
          ready={now > 0}
          avoided={formatNumber(locale, value.truckRollsAvoided, 0)}
          saved={money(value.savingsUsd)}
          cost={money(value.platformCostMtdUsd)}
          projected={money(value.projectedSavingsUsd)}
          monthCost={money(value.platformCostUsd)}
          roi={formatPercent(locale, value.roi, 0)}
          remote={value.remoteFixableShare === null ? null : formatPercent(locale, value.remoteFixableShare, 0)}
          llm={
            <KpiTile
              testId="kpi-llm"
              loading={!now}
              label={t("llmSpend")}
              icon={<Bot />}
              value={value.llmSpendMtdUsd}
              format={(v) => formatMoney(locale, v, currency, { copPerUsd: assumptions.copPerUsd })}
              footnote={t("llmSpendFoot", {
                month: money(value.llmSpendMonthUsd),
                share: formatPercent(locale, value.llmSpendMonthUsd / Math.max(1, value.platformCostUsd), 1),
              })}
              className="shadow-none"
            />
          }
        />
        <Card className="xl:col-span-2" aria-labelledby="ov-throughput">
          <CardHeader
            id="ov-throughput"
            title={t("throughputTitle")}
            subtitle={t("throughputSubtitle", { minutes: range / 60 })}
            icon={<Activity className="size-3.5" />}
          />
          <div className="px-3 pb-3">
            {loading ? (
              <EmptyState title={tc("noData")} body={tc("noDataBody")} />
            ) : (
              <ThroughputChart
                points={hist}
                markers={stream.markers}
                ariaLabel={t("throughputTitle")}
                seriesName={tc("events")}
                height={250}
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4" aria-labelledby="ov-recent">
        <CardHeader
          id="ov-recent"
          title={t("recentIncidents")}
          icon={<Siren className="size-3.5" />}
          actions={
            <Link href="/incidents" className="text-xs font-medium text-accent hover:underline">
              {t("viewAll")}
            </Link>
          }
        />
        <ul className="divide-y divide-border border-t border-border">
          {incidents.slice(0, 5).map((v) => (
            <li key={v.incident.incident_id}>
              <IncidentRow view={v} href />
            </li>
          ))}
          {incidents.length === 0 ? <EmptyState title={tc("noData")} /> : null}
        </ul>
      </Card>
    </>
  );
}

function ValueCard(props: {
  ready: boolean;
  avoided: string;
  saved: string;
  cost: string;
  projected: string;
  monthCost: string;
  roi: string;
  remote: string | null;
  llm: ReactNode;
}) {
  const t = useTranslations("overview");
  return (
    <Card className="relative overflow-hidden" aria-labelledby="ov-value" data-testid="value-card">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(closest-side,var(--good-soft),transparent)]"
      />
      <CardHeader id="ov-value" title={t("valueTitle")} icon={<BadgeDollarSign className="size-3.5" />} />
      <div className="space-y-3 px-5 pb-5">
        {!props.ready ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <p className="text-[15px] leading-6 text-fg-2">
            {t.rich("valueNarrative", {
              b: bold,
              avoided: props.avoided,
              saved: props.saved,
              cost: props.cost,
              projected: props.projected,
              monthCost: props.monthCost,
              roi: props.roi,
            })}
          </p>
        )}
        {props.remote ? <p className="text-xs text-fg-3">{t("valueRemote", { share: props.remote })}</p> : null}
        {props.llm}
        <p className="text-[11px] text-fg-3">{t("valueDisclaimer")}</p>
      </div>
    </Card>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-fg-2">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="h-8 w-28 rounded-lg border border-border-strong bg-surface-2 px-2 text-right tabular text-fg"
        />
        {suffix ? <span className="w-4 text-xs text-fg-3">{suffix}</span> : <span className="w-4" />}
      </span>
    </label>
  );
}

export function AssumptionsDialog() {
  const t = useTranslations("overview");
  const tc = useTranslations("common");
  const a = useStore((s) => s.assumptions);
  const set = useStore((s) => s.setAssumptions);
  const reset = useStore((s) => s.resetAssumptions);
  const changed = (Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]).some((k) => a[k] !== DEFAULT_ASSUMPTIONS[k]);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button size="sm" data-testid="assumptions-open">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {t("assumptions")}
          {changed ? <span className="size-1.5 rounded-full bg-accent" aria-hidden /> : null}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-strong bg-surface p-6 shadow-2xl">
          <div className="mb-1 flex items-start justify-between gap-4">
            <Dialog.Title className="text-base font-semibold text-fg">{t("assumptionsTitle")}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label={tc("close")}>
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-xs text-fg-3">{t("assumptionsBody")}</Dialog.Description>
          <div className="divide-y divide-border">
            <NumberField
              label={t("aTruckRolls")}
              value={a.truckRollsPer1kDevicesMonth}
              step={0.05}
              min={0}
              max={20}
              onChange={(v) => set({ truckRollsPer1kDevicesMonth: v })}
            />
            <NumberField
              label={t("aAvoidable")}
              value={Math.round(a.avoidableShare * 100)}
              step={1}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => set({ avoidableShare: v / 100 })}
            />
            <NumberField
              label={t("aCost")}
              value={a.truckRollCostUsd}
              step={10}
              min={0}
              max={5000}
              suffix="$"
              onChange={(v) => set({ truckRollCostUsd: v })}
            />
            <NumberField
              label={t("aSla")}
              value={Math.round(a.slaAvailabilityTarget * 1000) / 10}
              step={0.1}
              min={90}
              max={100}
              suffix="%"
              onChange={(v) => set({ slaAvailabilityTarget: v / 100 })}
            />
            <NumberField label={t("aFx")} value={a.copPerUsd} step={50} min={1} max={20000} onChange={(v) => set({ copPerUsd: v })} />
          </div>
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11px] text-fg-2">{t("formula")}</p>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="ghost" onClick={reset} className={cn(!changed && "invisible")}>
              {tc("reset")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
