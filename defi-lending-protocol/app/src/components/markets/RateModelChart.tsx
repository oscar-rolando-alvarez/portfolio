import type { RateModel } from "@/lib/accounts";
import { formatBps } from "@/lib/format";
import { BPS, borrowRateBps, rateCurve } from "@/lib/rates";

const W = 480;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 36, left: 48 };

export function RateModelChart({
  model,
  reserveFactorBps,
  currentUtilizationBps,
  title,
}: {
  model: RateModel;
  reserveFactorBps: number;
  currentUtilizationBps: number;
  title: string;
}) {
  const points = rateCurve(model, reserveFactorBps, 100);
  const maxRate = Math.max(100, ...points.map((p) => p.borrowRateBps));
  // Round the y-axis up to a friendly step.
  const step = maxRate <= 1_000 ? 200 : maxRate <= 5_000 ? 1_000 : maxRate <= 20_000 ? 5_000 : 25_000;
  const yMax = Math.ceil(maxRate / step) * step;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (u: number) => PAD.left + (u / BPS) * innerW;
  const y = (r: number) => PAD.top + innerH - (r / yMax) * innerH;
  const borrowPath = points.map((p) => `${x(p.utilizationBps)},${y(p.borrowRateBps)}`).join(" ");
  const supplyPath = points.map((p) => `${x(p.utilizationBps)},${y(p.supplyRateBps)}`).join(" ");
  const yTicks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const xTicks = [0, 2_500, 5_000, 7_500, 10_000];
  const opt = model.optimalUtilizationBps;
  const cu = Math.min(Math.max(currentUtilizationBps, 0), BPS);
  const currentRate = borrowRateBps(model, cu);
  const titleId = `rate-chart-${title.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <figure className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        className="h-auto w-full max-w-3xl text-muted"
      >
        <title id={titleId}>
          {`${title}: borrow APR ${formatBps(model.baseRateBps)} at 0% utilization, ${formatBps(
            borrowRateBps(model, opt),
          )} at the ${formatBps(opt, 0)} kink, ${formatBps(borrowRateBps(model, BPS))} at 100%.`}
        </title>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.15} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor">
              {formatBps(t, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill="currentColor">
            {formatBps(t, 0)}
          </text>
        ))}
        <text x={PAD.left + innerW / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="currentColor">
          Utilization
        </text>
        {opt > 0 && opt < BPS && (
          <g>
            <line x1={x(opt)} x2={x(opt)} y1={PAD.top} y2={PAD.top + innerH} stroke="currentColor" strokeDasharray="3 4" strokeOpacity={0.5} />
            <text x={x(opt) + 4} y={PAD.top + 10} fontSize={10} fill="currentColor">
              kink
            </text>
          </g>
        )}
        <polyline points={supplyPath} fill="none" stroke="var(--color-chart-supply)" strokeWidth={2} strokeDasharray="6 4" />
        <polyline points={borrowPath} fill="none" stroke="var(--color-chart-borrow)" strokeWidth={2.5} />
        <circle cx={x(cu)} cy={y(currentRate)} r={5} fill="var(--color-chart-borrow)" stroke="var(--color-surface)" strokeWidth={2} />
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-5 bg-chart-borrow" /> Borrow APR
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-5 border-t-2 border-dashed border-chart-supply" /> Supply APR
        </span>
        <span>
          Current: {formatBps(cu)} utilization → {formatBps(currentRate)} borrow APR
        </span>
      </figcaption>
    </figure>
  );
}
