import { useId } from "react";

/** Tiny dependency-free SVG sparkline with a soft area fill and an end dot. */
export function Sparkline({
  values,
  color = "var(--accent)",
  height = 36,
  width = 120,
  min,
  max,
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  const id = useId();
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - lo) / span) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${line}L${width},${height}L0,${height}Z`;
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

export function downsample(values: number[], target = 60): number[] {
  if (values.length <= target) return values;
  const bucket = values.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    const slice = values.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    out.push(slice.reduce((s, x) => s + x, 0) / slice.length);
  }
  return out;
}
