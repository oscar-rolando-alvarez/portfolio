"use client";

import { Inbox, MousePointerClick, Siren } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardHeader, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { useRouter } from "@/i18n/navigation";
import { sortedIncidents } from "@/lib/stream/reducer";
import { useStore } from "@/lib/store";
import { IncidentDetail } from "./incident-detail";
import { IncidentRow } from "./incident-row";

type Filter = "all" | "active" | "resolved";

export function IncidentsView() {
  const t = useTranslations("incidents");
  const stream = useStore((s) => s.stream);
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const all = useMemo(() => sortedIncidents(stream), [stream]);
  const list = all.filter((v) =>
    filter === "all" ? true : filter === "active" ? v.incident.status !== "RESOLVED" : v.incident.status === "RESOLVED",
  );
  const requested = params.get("id");
  const selected = (requested && stream.incidents[requested]) || all.find((v) => v.incident.status !== "RESOLVED") || all[0];
  const loading = stream.status === "connecting" || stream.status === "idle";

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <Card className="lg:sticky lg:top-20" aria-labelledby="feed-title">
          <CardHeader
            id="feed-title"
            title={t("feed")}
            icon={<Siren className="size-3.5" />}
            actions={
              <Segmented
                label={t("feed")}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: t("filterAll") },
                  { value: "active", label: t("filterActive") },
                  { value: "resolved", label: t("filterResolved") },
                ]}
              />
            }
          />
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto border-t border-border" aria-live="polite">
            {loading
              ? [0, 1, 2].map((k) => (
                  <li key={k} className="px-5 py-3">
                    <Skeleton className="h-10" />
                  </li>
                ))
              : list.map((v) => (
                  <li key={v.incident.incident_id}>
                    <IncidentRow
                      view={v}
                      selected={selected?.incident.incident_id === v.incident.incident_id}
                      onSelect={() => router.replace({ pathname: "/incidents", query: { id: v.incident.incident_id } }, { scroll: false })}
                    />
                  </li>
                ))}
            {!loading && list.length === 0 ? (
              <li>
                <EmptyState icon={<Inbox className="size-5" />} title={t("empty")} body={t("emptyBody")} />
              </li>
            ) : null}
          </ul>
        </Card>
        <div className="min-w-0">
          {selected ? (
            <IncidentDetail key={selected.incident.incident_id} view={selected} />
          ) : (
            <Card>
              <EmptyState icon={<MousePointerClick className="size-5" />} title={t("select")} body={t("selectBody")} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
