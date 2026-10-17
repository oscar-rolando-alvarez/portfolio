"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  Bot,
  Check,
  CircleCheck,
  Cloud,
  Copy,
  MapPin,
  Radio,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Truck,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, cn, Skeleton } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { EnrichmentItem, IncidentView } from "@/lib/stream/types";
import { useStore, type RemediationAction } from "@/lib/store";
import { SeverityBadge, StatusBadge } from "./incident-row";

function Section({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase [&_svg]:size-3.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Pipeline({ view, action }: { view: IncidentView; action?: RemediationAction }) {
  const t = useTranslations("incidents");
  const s = view.incident.status;
  const done = {
    detected: true,
    enriched: s !== "OPEN",
    diagnosed: s === "DIAGNOSED" || s === "NEEDS_REVIEW" || s === "RESOLVED",
    decision: !!action || s === "RESOLVED",
  };
  const steps = [
    { key: "detected", label: t("stepDetected"), icon: Radio },
    { key: "enriched", label: t("stepEnriched"), icon: Cloud },
    { key: "diagnosed", label: t("stepDiagnosed"), icon: Bot },
    { key: "decision", label: t("stepDecision"), icon: UserCheck },
  ] as const;
  return (
    <ol className="flex items-center gap-1" aria-label={t("pipeline")}>
      {steps.map((st, i) => {
        const ok = done[st.key];
        const current = !ok && (i === 0 || done[steps[i - 1]!.key]);
        return (
          <li key={st.key} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium",
                ok
                  ? "border-good/30 bg-good-soft text-good"
                  : current
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border text-fg-3",
              )}
            >
              {ok ? (
                <Check className="size-3 shrink-0" aria-hidden />
              ) : (
                <st.icon className={cn("size-3 shrink-0", current && "animate-pulse")} aria-hidden />
              )}
              <span className="truncate">{st.label}</span>
              <span className="sr-only">{ok ? "✓" : ""}</span>
            </span>
            {i < steps.length - 1 ? <span aria-hidden className={cn("h-px min-w-2 flex-1", ok ? "bg-good/40" : "bg-border")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function EnrichmentCard({ item }: { item: EnrichmentItem }) {
  const t = useTranslations("incidents");
  const d = item.data as Record<string, unknown>;
  const Icon = { celltower: RadioTower, weather: Cloud, carrier: Radio, status_feed: Zap }[item.source] ?? Cloud;
  let body: ReactNode = null;
  if (item.source === "celltower")
    body = (
      <span className="font-mono">
        {String(d.lat)}, {String(d.lon)} · ±{String(d.range_m)} m
      </span>
    );
  if (item.source === "weather")
    body = (
      <span>
        {d.severe ? <span className="font-medium text-serious">{t("severeWeather")}</span> : t("noSevere")} · {String(d.temperature_c)}°C ·{" "}
        {String(d.wind_gusts_kmh ?? d.wind_speed_kmh)} km/h
      </span>
    );
  if (item.source === "carrier")
    body = (
      <span>
        {String(d.operator)} ({String(d.country)}){d.roaming_agreement ? ` · ${t("roamingAgreement")}` : ""}
      </span>
    );
  if (item.source === "status_feed") {
    const rel = Array.isArray(d.relevant) ? d.relevant.length : 0;
    body = rel ? <span className="font-medium text-serious">{t("outageFeed", { count: rel })}</span> : t("noOutageFeed");
  }
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
          <Icon className="size-3.5 text-fg-3" aria-hidden />
          {t(`source.${item.source}` as "source.weather")}
        </span>
        <Badge tone={item.status === "ok" ? "good" : item.status === "degraded" ? "warning" : "critical"}>
          {t(`enrichStatus.${item.status}`)}
          {item.cached ? ` · ${t("cached")}` : ""}
        </Badge>
      </div>
      <p className="text-xs text-fg-2">{item.status === "unavailable" ? (item.error ?? "—") : body}</p>
    </div>
  );
}

function ConfirmButton({
  label,
  confirmText,
  onConfirm,
  variant,
  icon,
  testId,
}: {
  label: string;
  confirmText: string;
  onConfirm: () => void;
  variant: "primary" | "secondary";
  icon: ReactNode;
  testId: string;
}) {
  const t = useTranslations("incidents");
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant={variant} data-testid={testId}>
          {icon}
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl">
          <Dialog.Title className="text-sm font-semibold text-fg">{label}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-fg-2">{confirmText}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">{t("cancel")}</Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button variant="primary" onClick={onConfirm} data-testid={`${testId}-confirm`}>
                {t("confirm")}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function IncidentDetail({ view }: { view: IncidentView }) {
  const t = useTranslations("incidents");
  const locale = useLocale() as "en" | "es";
  const now = useNow(10_000);
  const action = useStore((s) => s.actions[view.incident.incident_id]);
  const record = useStore((s) => s.recordAction);
  const [copied, setCopied] = useState(false);
  const i = view.incident;
  const rec = view.diagnosis[locale] ?? view.diagnosis.en;
  const fellBack = !!rec && !view.diagnosis[locale];
  const d = rec?.diagnosis;
  const lead = view.detection.leadSeconds;

  return (
    <article className="space-y-6" aria-labelledby="incident-title" data-testid="incident-detail">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={i.severity} />
          <StatusBadge status={i.status} />
          <span className="font-mono text-[11px] text-fg-3">{i.incident_id}</span>
        </div>
        <h2 id="incident-title" className="text-xl font-semibold tracking-[-0.02em] text-fg">
          {t(`fault.${i.suspected_fault}`)}{" "}
          <span className="text-fg-3">
            · {t(`scope.${i.scope_type}`)} <span className="font-mono text-base">{i.scope}</span>
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
          <span>{formatDateTime(locale, view.detection.confirmedMs || i.opened_at)}</span>
          <span className="tabular">
            {t("affected", { affected: formatNumber(locale, i.affected_devices), total: formatNumber(locale, i.total_devices) })}
          </span>
          {lead ? <span className="text-accent">{t("detectionLead", { seconds: Math.round(lead) })}</span> : null}
          {i.scope_type === "cell" ? (
            <Link
              href={{ pathname: "/map", query: { cell: i.scope } }}
              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            >
              <MapPin className="size-3" aria-hidden />
              {t("openOnMap")}
            </Link>
          ) : null}
        </div>
        <Pipeline view={view} action={action} />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t("signals")} icon={<Radio />}>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-fg-3">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {t("metric")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("value")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("baseline")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("zscore")}
                  </th>
                </tr>
              </thead>
              <tbody className="tabular">
                {i.signals.map((s) => (
                  <tr key={s.metric} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-fg-2">{s.metric}</td>
                    <td className="px-3 py-2 text-right text-fg">{formatNumber(locale, s.value, 3)}</td>
                    <td className="px-3 py-2 text-right text-fg-3">{formatNumber(locale, s.baseline, 3)}</td>
                    <td className="px-3 py-2 text-right font-medium text-serious">{formatNumber(locale, s.zscore, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(i.top_causes).length ? (
            <p className="text-xs text-fg-3">
              {t("causes")}:{" "}
              {Object.entries(i.top_causes).map(([k, v]) => (
                <span key={k} className="mr-2 font-mono text-fg-2">
                  {k} ×{formatNumber(locale, v)}
                </span>
              ))}
            </p>
          ) : null}
        </Section>
        <Section title={t("enrichment")} icon={<Cloud />}>
          {view.enrichment ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {view.enrichment.items.map((it) => (
                <EnrichmentCard key={it.source} item={it} />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((k) => (
                <Skeleton key={k} className="h-16" />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Bot className="size-4 text-accent" aria-hidden />
            {t("diagnosis")}
          </h3>
          {rec ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-3">
              <Badge tone={rec.guardrail_status === "refused" ? "critical" : rec.guardrail_status === "repaired" ? "warning" : "good"}>
                {rec.guardrail_status === "refused" ? (
                  <ShieldAlert className="size-3" aria-hidden />
                ) : (
                  <ShieldCheck className="size-3" aria-hidden />
                )}
                {t("guardrails")}: {t(`guardrail.${rec.guardrail_status}`)}
              </Badge>
              <span>
                {t("model")}: <span className="font-mono">{rec.model}</span> ·{" "}
                {t("tokens", { input: formatNumber(locale, rec.input_tokens), output: formatNumber(locale, rec.output_tokens) })}
              </span>
              <Badge tone={fellBack ? "warning" : "accent"} data-testid="diagnosis-locale">
                {fellBack ? t("fallbackLocale") : t("diagnosisLocale", { locale: locale.toUpperCase() })}
              </Badge>
            </div>
          ) : null}
        </div>
        {!d ? (
          <div className="flex items-center gap-3 px-5 py-6">
            <Bot className="size-5 animate-pulse text-accent" aria-hidden />
            <div>
              <p className="text-sm font-medium text-fg">{t("diagnosisPending")}</p>
              <p className="text-xs text-fg-3">{t("diagnosisPendingBody")}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-fg-3">{t("rootCause")}</span>
                  <Badge tone="accent" className="text-xs">
                    {t(`fault.${d.root_cause}`)}
                  </Badge>
                  <span className="text-xs text-fg-3">{t("confidence")}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${d.confidence * 100}%` }} />
                    </span>
                    <span className="text-xs font-medium text-fg tabular">{formatPercent(locale, d.confidence, 0)}</span>
                  </span>
                </div>
                <p className="mt-3 text-[15px] leading-6 text-fg" data-testid="diagnosis-summary">
                  {d.summary}
                </p>
              </div>
              <Section title={t("evidence")} icon={<CircleCheck />}>
                <ul className="space-y-1.5 text-sm text-fg-2">
                  {d.evidence.map((e) => (
                    <li key={e} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-3" />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title={t("remediation")} icon={<Wrench />}>
                <ol className="space-y-2">
                  {d.remediation_steps.map((s) => (
                    <li key={s.order} className="flex gap-3 rounded-xl border border-border bg-surface-2 p-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg tabular">
                        {s.order}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm text-fg">{s.action}</p>
                        <div className="flex flex-wrap gap-1">
                          <Badge>{t(`owner.${s.owner}`)}</Badge>
                          {s.automated ? <Badge tone="accent">{t("automated")}</Badge> : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            </div>
            <div className="space-y-5">
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  d.truck_roll_required ? "border-serious/30 bg-serious-soft" : "border-good/30 bg-good-soft",
                )}
              >
                <Truck className={cn("size-5", d.truck_roll_required ? "text-serious" : "text-good")} aria-hidden />
                <div>
                  <p className="text-xs text-fg-3">{t("truckRoll")}</p>
                  <p className="text-sm font-semibold text-fg">{d.truck_roll_required ? t("truckRollYes") : t("truckRollNo")}</p>
                </div>
              </div>
              <Section title={t("customerMessage")}>
                <blockquote
                  className="relative rounded-xl border border-border bg-surface-2 p-3 pr-10 text-sm leading-6 text-fg-2"
                  data-testid="customer-message"
                >
                  {d.customer_message}
                  <button
                    type="button"
                    className="absolute top-2 right-2 rounded-md p-1.5 text-fg-3 hover:bg-surface-3 hover:text-fg"
                    aria-label={copied ? t("copied") : t("copy")}
                    onClick={() => {
                      void navigator.clipboard?.writeText(d.customer_message).catch(() => undefined);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </button>
                </blockquote>
              </Section>
              {rec.guardrail_notes.length ? (
                <Section title={t("guardrails")} icon={<ShieldCheck />}>
                  <ul className="space-y-1 text-xs text-fg-3">
                    {rec.guardrail_notes.map((n) => (
                      <li key={n} className="font-mono">
                        {n}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              <Section title={t("runbooks")} icon={<BookOpen />}>
                <div className="flex flex-wrap gap-1.5">
                  {d.runbook_ids.map((r) => (
                    <Badge key={r} className="font-mono">
                      {r}
                    </Badge>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5" aria-labelledby="hitl-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h3 id="hitl-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <UserCheck className="size-4 text-accent" aria-hidden />
              {t("hitl")}
            </h3>
            <p className="mt-1 text-xs text-fg-3">{t("hitlBody")}</p>
          </div>
          {action ? (
            <div className="text-right" data-testid="hitl-result">
              <Badge tone={action.kind === "approved" ? "good" : "warning"} className="text-xs">
                <CircleCheck className="size-3.5" aria-hidden />
                {action.kind === "approved"
                  ? t("approvedAt", { time: formatRelative(locale, action.at, now) })
                  : t("dispatchedAt", { time: formatRelative(locale, action.at, now) })}
              </Badge>
              <p className="mt-1 text-[11px] text-fg-3">{t("localOnly")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ConfirmButton
                testId="hitl-approve"
                variant="primary"
                icon={<ShieldCheck className="size-4" aria-hidden />}
                label={t("approve")}
                confirmText={t("confirmApprove")}
                onConfirm={() => record(i.incident_id, { kind: "approved", at: Date.now() })}
              />
              <ConfirmButton
                testId="hitl-dispatch"
                variant="secondary"
                icon={<Truck className="size-4" aria-hidden />}
                label={t("dispatch")}
                confirmText={t("confirmDispatch")}
                onConfirm={() => record(i.incident_id, { kind: "dispatched", at: Date.now() })}
              />
            </div>
          )}
        </div>
      </Card>
    </article>
  );
}
