const DAY_MS = 86_400_000;

/** Whole days from ISO date `from` to ISO date `to` (UTC, may be negative). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
