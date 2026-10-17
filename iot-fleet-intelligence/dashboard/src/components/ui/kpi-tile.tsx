"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { NumberTicker } from "./number-ticker";
import { Card, cn, Skeleton } from "./primitives";
import { Sparkline } from "./sparkline";

export interface KpiDelta {
  value: string;
  direction: "up" | "down" | "flat";
  /** whether this direction is good news (drives colour; arrow + text always carry the meaning) */
  good: boolean;
  label?: string;
}

export function KpiTile({
  label,
  value,
  format,
  display,
  delta,
  spark,
  sparkColor,
  footnote,
  icon,
  loading,
  className,
  testId,
}: {
  label: string;
  value?: number;
  format?: (v: number) => string;
  display?: ReactNode;
  delta?: KpiDelta;
  spark?: number[];
  sparkColor?: string;
  footnote?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
  testId?: string;
}) {
  const Arrow = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  return (
    <Card className={cn("group relative flex flex-col gap-3 overflow-hidden p-4", className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
          {icon ? <span className="text-fg-3 [&>svg]:size-3.5">{icon}</span> : null}
          {label}
        </h3>
        {delta && !loading ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular",
              delta.direction === "flat"
                ? "bg-surface-3 text-fg-2"
                : delta.good
                  ? "bg-good-soft text-good"
                  : "bg-critical-soft text-critical",
            )}
            title={delta.label}
          >
            <Arrow aria-hidden className="size-3" />
            {delta.value}
            {delta.label ? <span className="sr-only"> {delta.label}</span> : null}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <div className="text-[28px] leading-8 font-semibold tracking-[-0.03em] text-fg">
          {display ?? (value !== undefined && format ? <NumberTicker value={value} format={format} /> : "—")}
        </div>
      )}
      {spark ? (
        <div className="-mx-1 h-9">{loading ? <Skeleton className="h-9 w-full" /> : <Sparkline values={spark} color={sparkColor} />}</div>
      ) : null}
      {footnote ? <p className="text-[11px] leading-4 text-fg-3">{footnote}</p> : null}
    </Card>
  );
}
