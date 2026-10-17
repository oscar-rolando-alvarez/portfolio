"use client";

import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, cn, severityTone } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { formatCompact, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { IncidentView } from "@/lib/stream/types";

const statusTone = {
  OPEN: "warning",
  ENRICHED: "accent",
  DIAGNOSED: "good",
  NEEDS_REVIEW: "serious",
  RESOLVED: "neutral",
} as const;

export function StatusBadge({ status }: { status: IncidentView["incident"]["status"] }) {
  const t = useTranslations("incidents.status");
  return (
    <Badge tone={statusTone[status]}>
      {status === "OPEN" || status === "ENRICHED" ? <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden /> : null}
      {t(status)}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: IncidentView["incident"]["severity"] }) {
  const t = useTranslations("overview.severity");
  return <Badge tone={severityTone[severity]}>{t(severity)}</Badge>;
}

export function IncidentRow({
  view,
  href,
  selected,
  onSelect,
}: {
  view: IncidentView;
  href?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const t = useTranslations("incidents");
  const locale = useLocale();
  const now = useNow(10_000);
  const i = view.incident;
  const opened = view.detection.confirmedMs || Date.parse(i.opened_at);
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          i.status === "RESOLVED"
            ? "bg-fg-3"
            : i.severity === "critical"
              ? "bg-critical"
              : i.severity === "high"
                ? "bg-serious"
                : "bg-warning",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-fg">{t(`fault.${i.suspected_fault}`)}</span>
          <SeverityBadge severity={i.severity} />
          <StatusBadge status={i.status} />
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-3">
          <span>
            {t(`scope.${i.scope_type}`)} <span className="font-mono text-fg-2">{i.scope}</span>
          </span>
          <span className="tabular">
            {t("affected", { affected: formatCompact(locale, i.affected_devices), total: formatCompact(locale, i.total_devices) })}
          </span>
          <span>{t("opened", { time: formatRelative(locale, opened, now) })}</span>
        </span>
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-fg-3" aria-hidden />
    </>
  );
  const cls = cn(
    "flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2",
    selected && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
  );
  if (href) {
    return (
      <Link href={{ pathname: "/incidents", query: { id: i.incident_id } }} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onSelect} className={cls} aria-pressed={selected} data-testid="incident-row">
      {body}
    </button>
  );
}
