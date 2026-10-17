export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Formats an integer amount of base units with the given decimals, e.g. (1500000n, 6) -> "1.5". */
export function formatUnits(amount: bigint, decimals: number, maxFractionDigits = 4): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const d = Math.max(0, Math.trunc(decimals));
  const scale = 10n ** BigInt(d);
  const whole = abs / scale;
  let fraction = d > 0 ? (abs % scale).toString().padStart(d, "0") : "";
  fraction = fraction.slice(0, Math.max(0, maxFractionDigits)).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}${fraction ? `.${fraction}` : ""}`;
}

export function lamportsToSol(lamports: bigint, maxFractionDigits = 4): string {
  return formatUnits(lamports, 9, maxFractionDigits);
}

/** Basis points to a percentage string: 1234 -> "12.34%". */
export function formatBps(bps: number, fractionDigits = 2): string {
  return `${(bps / 100).toFixed(fractionDigits)}%`;
}

export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/** Share of `part` in `total` as a 0..100 number, safe for bigints and zero totals. */
export function percentOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 10_000n) / total) / 100;
}

export function formatHealthFactor(hf: number): string {
  if (!Number.isFinite(hf)) return "∞";
  return hf.toFixed(2);
}

/** Formats a unix timestamp (seconds) as an ISO-like UTC string. */
export function formatUnixTime(seconds: bigint): string {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Human duration like "2d 3h", "4h 12m", "35s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
