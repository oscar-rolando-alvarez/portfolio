"use client";

import * as Slider from "@radix-ui/react-slider";
import { Calculator, Check, Download, Lightbulb, Link2, Printer, Scale, TrendingUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { HorizontalBars, ScaleCurve } from "@/components/charts/lazy";
import { PageHeader } from "@/components/shell/app-shell";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Badge, Button, Card, CardHeader, cn, Segmented } from "@/components/ui/primitives";
import { CATEGORIES, estimate, PRICING, type FleetProfile } from "@/lib/cost/model";
import { formatCompact, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { useStore } from "@/lib/store";
import { scenarioCsv } from "@/lib/cost/export";

export const INTERVALS = [30, 60, 300, 900, 3600] as const;
export const PAYLOADS = [64, 128, 256, 512, 1024, 2048, 4096] as const;
export const BATCHES = [1, 2, 5, 10, 20] as const;
export type Tier = "small" | "tiered" | "large";
const TIER_SHARE: Record<Tier, number> = { small: 0, tiered: 0.2, large: 1 };

export interface Scenario {
  devices: number;
  interval: number;
  payload: number;
  batch: number;
  llmShare: number;
  tier: Tier;
}

export const DEFAULT_SCENARIO: Scenario = { devices: 1_000_000, interval: 300, payload: 512, batch: 1, llmShare: 1, tier: "large" };

export function toProfile(s: Scenario): Partial<FleetProfile> {
  return {
    devices: s.devices,
    report_interval_seconds: s.interval,
    payload_bytes: s.payload,
    readings_per_message: s.batch,
    llm_share: s.llmShare,
    llm_large_share: TIER_SHARE[s.tier],
  };
}

export function parseScenario(q: URLSearchParams): Scenario {
  const num = (k: string, lo: number, hi: number, d: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const tier = q.get("tier");
  return {
    devices: Math.round(num("devices", 10_000, 10_000_000, DEFAULT_SCENARIO.devices)),
    interval: num("interval", 30, 3600, DEFAULT_SCENARIO.interval),
    payload: num("payload", 64, 4096, DEFAULT_SCENARIO.payload),
    batch: num("batch", 1, 20, DEFAULT_SCENARIO.batch),
    llmShare: num("llm", 0, 1, DEFAULT_SCENARIO.llmShare),
    tier: tier === "small" || tier === "tiered" || tier === "large" ? tier : DEFAULT_SCENARIO.tier,
  };
}

export function scenarioQuery(s: Scenario): string {
  return new URLSearchParams({
    devices: String(s.devices),
    interval: String(s.interval),
    payload: String(s.payload),
    batch: String(s.batch),
    llm: String(s.llmShare),
    tier: s.tier,
  }).toString();
}

// log-scale device slider: position 0..100 -> 10k..10M
const LOG_MIN = Math.log10(10_000);
const LOG_MAX = Math.log10(10_000_000);
const toDevices = (p: number) => {
  const raw = 10 ** (LOG_MIN + ((LOG_MAX - LOG_MIN) * p) / 100);
  const mag = 10 ** Math.floor(Math.log10(raw));
  return Math.round(raw / (mag / 10)) * (mag / 10);
};
const toPos = (d: number) => ((Math.log10(d) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;

function Field({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-fg-2">{label}</span>
        <span className="text-sm font-semibold text-fg tabular">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Range({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <Slider.Root
      className="relative flex h-5 w-full touch-none items-center select-none"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v ?? value)}
    >
      <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
        <Slider.Range className="absolute h-full rounded-full bg-accent" />
      </Slider.Track>
      <Slider.Thumb
        aria-label={label}
        className="block size-4 rounded-full border-2 border-accent bg-surface shadow transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
      />
    </Slider.Root>
  );
}

function DiscreteRange<T extends number>({
  values,
  value,
  onChange,
  label,
  format,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format: (v: T) => string;
}) {
  const i = Math.max(0, values.indexOf(value));
  return (
    <div>
      <Range value={i} min={0} max={values.length - 1} step={1} onChange={(k) => onChange(values[k]!)} label={label} />
      <div className="mt-1 flex justify-between text-[10px] text-fg-3 tabular">
        {values.map((v) => (
          <span key={v}>{format(v)}</span>
        ))}
      </div>
    </div>
  );
}

const fmtInterval = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`);

export function CostView() {
  const t = useTranslations("cost");
  const locale = useLocale();
  const params = useSearchParams();
  const currency = useStore((s) => s.currency);
  const assumptions = useStore((s) => s.assumptions);
  const [sc, setSc] = useState<Scenario>(() => parseScenario(new URLSearchParams(params.toString())));
  const [shared, setShared] = useState(false);
  const set = (p: Partial<Scenario>) => setSc((s) => ({ ...s, ...p }));

  // keep the URL shareable without adding history entries
  useEffect(() => {
    const url = `${window.location.pathname}?${scenarioQuery(sc)}`;
    window.history.replaceState(null, "", url);
  }, [sc]);

  const report = useMemo(() => estimate(toProfile(sc)), [sc]);
  const curve = useMemo(() => {
    const pts: [number, number][] = [];
    for (let p = 0; p <= 100; p += 4) {
      const d = toDevices(p);
      pts.push([d, estimate({ ...toProfile(sc), devices: d }, false).perDeviceUsd]);
    }
    return pts;
  }, [sc]);
  const money = (usd: number, opts: { compact?: boolean; precise?: boolean } = {}) =>
    formatMoney(locale, usd, currency, { ...opts, copPerUsd: assumptions.copPerUsd });

  const savings = (sc.devices / 1000) * assumptions.truckRollsPer1kDevicesMonth * assumptions.avoidableShare * assumptions.truckRollCostUsd;
  const net = savings - report.totalUsd;
  const multiple = report.totalUsd > 0 ? savings / report.totalUsd : 0;
  const genai = report.byCategory["GenAI (LLM)"] ?? 0;
  const rows = CATEGORIES.map((c) => ({ label: t(`category.${c}`), value: report.byCategory[c] ?? 0 })).filter((r) => r.value > 0.005);

  const downloadCsv = () => {
    const blob = new Blob([scenarioCsv(sc, report)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fleetintel-cost-${sc.devices}-devices.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" onClick={downloadCsv} data-testid="export-csv">
              <Download className="size-3.5" aria-hidden />
              {t("exportCsv")}
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" aria-hidden />
              {t("exportPdf")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                setShared(true);
                setTimeout(() => setShared(false), 1800);
              }}
            >
              {shared ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
              {shared ? t("shared") : t("share")}
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[380px_1fr]">
        <Card className="space-y-6 p-5 xl:sticky xl:top-20" aria-labelledby="cost-scenario">
          <h2 id="cost-scenario" className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Calculator className="size-3.5 text-fg-3" aria-hidden />
            {t("scenario")}
          </h2>
          <Field label={t("devices")} value={formatNumber(locale, sc.devices)}>
            <Range
              value={toPos(sc.devices)}
              min={0}
              max={100}
              step={0.5}
              onChange={(p) => set({ devices: toDevices(p) })}
              label={t("devices")}
            />
            <div className="flex justify-between text-[10px] text-fg-3 tabular">
              <span>{formatCompact(locale, 10_000)}</span>
              <span>{formatCompact(locale, 10_000_000)}</span>
            </div>
          </Field>
          <Field label={t("interval")} value={t("intervalValue", { value: fmtInterval(sc.interval) })}>
            <DiscreteRange
              values={INTERVALS}
              value={sc.interval as (typeof INTERVALS)[number]}
              onChange={(v) => set({ interval: v })}
              label={t("interval")}
              format={fmtInterval}
            />
          </Field>
          <Field label={t("payload")} value={`${formatNumber(locale, sc.payload)} B`}>
            <DiscreteRange
              values={PAYLOADS}
              value={sc.payload as (typeof PAYLOADS)[number]}
              onChange={(v) => set({ payload: v })}
              label={t("payload")}
              format={(v) => (v >= 1024 ? `${v / 1024}K` : String(v))}
            />
          </Field>
          <Field label={t("batch")} value={`× ${sc.batch}`}>
            <DiscreteRange
              values={BATCHES}
              value={sc.batch as (typeof BATCHES)[number]}
              onChange={(v) => set({ batch: v })}
              label={t("batch")}
              format={String}
            />
          </Field>
          <Field label={t("llmShare")} value={formatPercent(locale, sc.llmShare, 0)}>
            <Range
              value={sc.llmShare * 100}
              min={0}
              max={100}
              step={5}
              onChange={(v) => set({ llmShare: v / 100 })}
              label={t("llmShare")}
            />
          </Field>
          <Field label={t("tier")} value="">
            <Segmented
              label={t("tier")}
              value={sc.tier}
              onChange={(tier) => set({ tier })}
              options={[
                { value: "small", label: t("tierSmall") },
                { value: "tiered", label: t("tierTiered") },
                { value: "large", label: t("tierLarge") },
              ]}
            />
          </Field>
          <p className="text-[11px] leading-4 text-fg-3">
            {t("pricing", { version: PRICING.version, region: PRICING.region })} {t("parity")}
          </p>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Card className="p-4" data-testid="cost-total">
              <p className="text-xs text-fg-3">{t("monthly")}</p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-accent tabular xl:text-2xl">
                <NumberTicker value={report.totalUsd} format={(v) => money(v)} />
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-fg-3">{t("perDevice")}</p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-fg tabular xl:text-2xl">
                {money(report.perDeviceUsd, { precise: true })}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-fg-3">{t("perMillion")}</p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-fg tabular xl:text-2xl">
                {money(report.perMillionReadingsUsd, { precise: true })}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-fg-3">{t("llmLine")}</p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-fg tabular xl:text-2xl">
                {formatPercent(locale, genai / Math.max(report.totalUsd, 1e-9), 1)}
              </p>
              <p className="text-[11px] text-fg-3 tabular">{money(genai)}</p>
            </Card>
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Card aria-labelledby="cost-breakdown">
              <CardHeader id="cost-breakdown" title={t("breakdown")} icon={<Calculator className="size-3.5" />} />
              <div className="px-4 pb-4">
                <HorizontalBars rows={rows} format={(v) => money(v, { compact: true })} ariaLabel={t("breakdown")} />
              </div>
            </Card>
            <Card aria-labelledby="cost-roi" className="relative overflow-hidden">
              <CardHeader id="cost-roi" title={t("roi")} icon={<TrendingUp className="size-3.5" />} />
              <div className="space-y-4 px-5 pb-5">
                {[
                  { label: t("roiSavings"), v: savings, tone: "bg-good" },
                  { label: t("roiCost"), v: report.totalUsd, tone: "bg-[var(--series-1)]" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-fg-2">{r.label}</span>
                      <span className="font-medium text-fg tabular">{money(r.v)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div
                        className={cn("h-full rounded-full transition-[width] duration-500", r.tone)}
                        style={{ width: `${(r.v / Math.max(savings, report.totalUsd, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <div>
                    <p className="text-xs text-fg-3">{t("roiNet")}</p>
                    <p className={cn("text-xl font-semibold tabular", net >= 0 ? "text-good" : "text-critical")} data-testid="roi-net">
                      {net >= 0 ? "+" : "−"}
                      {money(Math.abs(net))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-fg-3">{t("roiMultiple")}</p>
                    <p className="text-xl font-semibold text-fg tabular">{formatNumber(locale, multiple, 1)}×</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Card aria-labelledby="cost-scale">
            <CardHeader id="cost-scale" title={t("scale")} subtitle={t("scaleSub")} icon={<Scale className="size-3.5" />} />
            <div className="px-3 pb-3">
              <ScaleCurve
                points={curve}
                current={[sc.devices, report.perDeviceUsd]}
                ariaLabel={t("scale")}
                formatX={(v) => formatCompact(locale, v)}
                formatY={(v) => money(v, { precise: true })}
              />
            </div>
          </Card>

          <Card aria-labelledby="cost-recs">
            <CardHeader
              id="cost-recs"
              title={t("recommendations")}
              subtitle={t("recommendationsSub")}
              icon={<Lightbulb className="size-3.5" />}
            />
            <ul className="divide-y divide-border border-t border-border">
              {report.recommendations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-sm text-fg">{t(`rec.${r.id}`)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone="good">{t("saves", { amount: money(r.monthlySavingsUsd, { compact: true }) })}</Badge>
                    <span className="hidden text-xs text-fg-3 tabular sm:inline">→ {money(r.newTotalUsd, { compact: true })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
