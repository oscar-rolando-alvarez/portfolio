/**
 * Locale-aware formatting (Intl) with USD/COP awareness. Every number on
 * screen goes through here so EN and ES render "1,234.5" vs "1.234,5",
 * "$1.2M" vs "1,2 M US$", and COP amounts without decimals.
 */

export type Currency = "USD" | "COP";

/** COP per USD. A labelled, user-editable assumption - not a live FX rate. */
export const DEFAULT_COP_PER_USD = 4000;

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

export function formatNumber(locale: string, value: number, digits = 0): string {
  return nf(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

export function formatCompact(locale: string, value: number, digits = 1): string {
  return nf(locale, { notation: "compact", maximumFractionDigits: digits }).format(value);
}

export function formatPercent(locale: string, ratio: number, digits = 1): string {
  return nf(locale, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(ratio);
}

export function convert(usd: number, currency: Currency, copPerUsd = DEFAULT_COP_PER_USD): number {
  return currency === "COP" ? usd * copPerUsd : usd;
}

/**
 * Money in the selected currency. COP is shown without decimals (centavos are not used in practice);
 * tiny USD unit costs (e.g. per-device) keep up to 4 decimals.
 */
export function formatMoney(
  locale: string,
  usd: number,
  currency: Currency = "USD",
  opts: { compact?: boolean; copPerUsd?: number; precise?: boolean } = {},
): string {
  const value = convert(usd, currency, opts.copPerUsd);
  if (opts.compact && Math.abs(value) >= 10_000) {
    return nf(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  let digits = currency === "COP" ? 0 : 2;
  if (opts.precise && currency === "USD" && Math.abs(value) < 1) digits = 4;
  if (opts.precise && currency === "COP" && Math.abs(value) < 100) digits = 2;
  return nf(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatDuration(locale: string, seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 90) return nf(locale, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 0 }).format(seconds);
  if (seconds < 5400)
    return nf(locale, { style: "unit", unit: "minute", unitDisplay: "narrow", maximumFractionDigits: 1 }).format(seconds / 60);
  return nf(locale, { style: "unit", unit: "hour", unitDisplay: "narrow", maximumFractionDigits: 1 }).format(seconds / 3600);
}

export function formatTime(locale: string, ts: number, withSeconds = true): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(ts);
}

export function formatDateTime(locale: string, iso: string | number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(iso));
}

export function formatRelative(locale: string, fromMs: number, nowMs: number): string {
  const diff = Math.round((fromMs - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatBytesPerSec(locale: string, bps: number): string {
  const units = ["byte-per-second", "kilobyte-per-second", "megabyte-per-second", "gigabyte-per-second"] as const;
  let v = bps;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return nf(locale, { style: "unit", unit: units[i], unitDisplay: "short", maximumFractionDigits: 1 }).format(v);
}
