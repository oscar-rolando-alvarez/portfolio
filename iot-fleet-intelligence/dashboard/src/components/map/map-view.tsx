"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Crosshair, Expand, MapPinOff, RadioTower, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { IncidentRow } from "@/components/incidents/incident-row";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { COUNTRY_OF_MCC, siteLocation } from "@/lib/geo";
import { formatNumber, formatPercent } from "@/lib/format";
import { sortedIncidents } from "@/lib/stream/reducer";
import { useStore } from "@/lib/store";

const FleetMap = dynamic(() => import("./fleet-map").then((m) => m.FleetMap), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

export function MapView() {
  const t = useTranslations("map");
  const tc = useTranslations("common");
  const locale = useLocale();
  const params = useSearchParams();
  const cells = useStore((s) => s.stream.cells);
  const stream = useStore((s) => s.stream);
  const [selected, setSelected] = useState<string | null>(params.get("cell"));
  const [focus, setFocus] = useState<{ kind: "fit" | "degraded" | "cell"; id?: string; n: number }>({ kind: "fit", n: 0 });
  const [noGl, setNoGl] = useState(false);

  // deep links fly to a site once data is in (?cell= also opens its drawer, ?focus= only moves the
  // camera); explicit buttons take over afterwards
  const requested = params.get("cell") ?? params.get("focus");
  const hasCells = !!cells;
  const deepLink = useMemo(() => (requested && hasCells ? { kind: "cell" as const, id: requested, n: 1 } : null), [requested, hasCells]);
  const camera = focus.n === 0 && deepLink ? deepLink : focus;

  const degraded = cells ? cells.health.filter((h) => h < 60).length : 0;
  const idx = selected && cells ? cells.ids.indexOf(selected) : -1;
  const related = useMemo(
    () =>
      selected
        ? sortedIncidents(stream).filter(
            (v) =>
              v.incident.scope === selected ||
              (v.incident.scope_type === "plmn" && selected.replace(/-/g, "").startsWith(v.incident.scope)),
          )
        : [],
    [selected, stream],
  );
  const loc = selected ? siteLocation(selected) : null;
  const [mcc, mnc, tac] = selected?.split("-") ?? [];

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Button size="sm" onClick={() => setFocus((f) => ({ kind: "fit", n: f.n + 2 }))}>
              <Expand className="size-3.5" aria-hidden />
              {t("fit")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!degraded}
              onClick={() => setFocus((f) => ({ kind: "degraded", n: f.n + 2 }))}
              data-testid="focus-degraded"
            >
              <Crosshair className="size-3.5" aria-hidden />
              {t("focusOutage")}
            </Button>
          </>
        }
      />
      <Card className="relative h-[min(68vh,720px)] min-h-[420px] overflow-hidden" data-testid="map-card">
        {noGl ? (
          <EmptyState icon={<MapPinOff className="size-5" />} title={t("noWebgl")} />
        ) : (
          <FleetMap
            frame={cells}
            selected={selected}
            onSelect={setSelected}
            focus={camera}
            onError={() => setNoGl(true)}
            label={t("title")}
          />
        )}
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2">
          <div
            className="pointer-events-auto rounded-xl border border-border bg-surface/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
            data-testid="map-legend"
          >
            <p className="font-medium text-fg tabular">
              {t("cells", { count: formatNumber(locale, cells?.ids.length ?? 0) })}
              {degraded ? <span className="ml-2 text-critical">· {t("degradedCells", { count: degraded })}</span> : null}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-fg-3">
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-good" aria-hidden />
                {t("legendHealthy")} ≥ 90
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" aria-hidden />
                {t("legendDegraded")} 60–90
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-critical" aria-hidden />
                {t("legendDown")} &lt; 60
              </li>
            </ul>
            <p className="mt-1 text-[10px] text-fg-3">{t("legendHeat")}</p>
          </div>
        </div>
      </Card>
      <p className="mt-2 text-[11px] text-fg-3">{t("basemapNote")}</p>

      <Dialog.Root open={!!selected} onOpenChange={(o) => !o && setSelected(null)} modal={false}>
        <Dialog.Portal>
          <Dialog.Content
            onInteractOutside={(e) => e.preventDefault()}
            className="fixed inset-y-0 right-0 z-40 flex w-[min(420px,100vw)] flex-col border-l border-border-strong bg-surface shadow-2xl animate-fade-up"
            data-testid="cell-drawer"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <RadioTower className="size-4 text-accent" aria-hidden />
                  <span className="truncate">{t("drawerTitle", { id: selected ?? "" })}</span>
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-fg-3">
                  {t("network")}: {mcc}-{mnc} ({COUNTRY_OF_MCC[mcc ?? ""] ?? "?"}) · {t("trackingArea")} {tac}
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label={tc("close")}>
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {cells && idx >= 0 ? (
                <dl className="grid grid-cols-2 gap-3">
                  {[
                    [t("health"), `${cells.health[idx]} / 100`, (cells.health[idx] ?? 100) < 60 ? "text-critical" : "text-fg"],
                    [t("anomaly"), formatPercent(locale, (cells.anomaly[idx] ?? 0) / 100, 0), "text-fg"],
                    [t("events"), formatNumber(locale, cells.events[idx] ?? 0), "text-fg"],
                    [t("online"), formatNumber(locale, cells.online[idx] ?? 0), "text-fg"],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="rounded-xl border border-border bg-surface-2 p-3">
                      <dt className="text-[11px] text-fg-3">{k}</dt>
                      <dd className={`mt-1 text-lg font-semibold tabular ${cls}`}>{v}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-xl border border-border bg-surface-2 p-3">
                    <dt className="text-[11px] text-fg-3">{t("location")}</dt>
                    <dd className="mt-1 font-mono text-xs text-fg-2">{loc ? `${loc[0]}, ${loc[1]}` : "—"}</dd>
                  </div>
                </dl>
              ) : (
                <Skeleton className="h-40" />
              )}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{t("related")}</h3>
                {related.length ? (
                  <ul className="-mx-5 divide-y divide-border border-y border-border">
                    {related.map((v) => (
                      <li key={v.incident.incident_id}>
                        <IncidentRow view={v} href />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-fg-3">{t("noRelated")}</p>
                )}
              </section>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
