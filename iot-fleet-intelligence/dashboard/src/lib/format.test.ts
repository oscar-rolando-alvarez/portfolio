import { describe, expect, it } from "vitest";
import {
  convert,
  formatBytesPerSec,
  formatCompact,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
} from "./format";

const nbsp = (s: string) => s.replace(/\u00a0|\u202f/g, " ");

describe("locale-aware formatting", () => {
  it("formats numbers per locale", () => {
    expect(formatNumber("en", 1234567.891, 1)).toBe("1,234,567.9");
    expect(nbsp(formatNumber("es", 1234567.891, 1))).toBe("1.234.567,9");
    expect(formatPercent("en", 0.98765)).toBe("98.8%");
    expect(nbsp(formatPercent("es", 0.98765))).toBe("98,8 %");
    expect(formatCompact("en", 1_250_000)).toBe("1.3M");
  });

  it("formats USD and COP with sensible precision", () => {
    expect(formatMoney("en", 14789.57)).toBe("$14,789.57");
    expect(nbsp(formatMoney("es", 14789.57))).toMatch(/^14\.789,57 US\$$/);
    expect(nbsp(formatMoney("es", 14789.57, "COP"))).toBe("59.158.280 COP");
    expect(formatMoney("en", 0.0148, "USD", { precise: true })).toBe("$0.0148");
    expect(formatMoney("en", 1_500_000, "USD", { compact: true })).toBe("$1.5M");
    expect(convert(10, "COP", 4100)).toBe(41000);
    expect(convert(10, "USD")).toBe(10);
  });

  it("formats durations and rates", () => {
    expect(nbsp(formatDuration("en", 42))).toBe("42s");
    expect(nbsp(formatDuration("en", 900))).toBe("15m");
    expect(nbsp(formatDuration("en", 7200))).toBe("2h");
    expect(formatDuration("en", -1)).toBe("—");
    expect(nbsp(formatBytesPerSec("en", 2_500_000))).toBe("2.5 MB/s");
    expect(formatRelative("en", 0, 120_000)).toBe("2 min. ago");
    expect(formatRelative("es", 0, 30_000)).toMatch(/hace 30 s/);
    expect(formatTime("en", Date.UTC(2026, 9, 1, 13, 5, 9))).toMatch(/\d\d:\d\d:\d\d/);
  });
});
