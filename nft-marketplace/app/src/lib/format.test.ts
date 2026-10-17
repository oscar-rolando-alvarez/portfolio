import { describe, expect, it } from "vitest";
import {
  formatBps,
  formatDuration,
  formatUnits,
  formatUnixTime,
  lamportsToSol,
  percentOf,
  shortenAddress,
} from "./format";

describe("formatUnits", () => {
  it("scales by decimals and trims trailing zeros", () => {
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits(1_000_000n, 6)).toBe("1");
    expect(formatUnits(0n, 6)).toBe("0");
  });
  it("adds thousands separators and truncates fraction digits", () => {
    expect(formatUnits(1_234_567_891_234n, 6, 2)).toBe("1,234,567.89");
  });
  it("handles zero decimals and negatives", () => {
    expect(formatUnits(42n, 0)).toBe("42");
    expect(formatUnits(-2_500n, 3)).toBe("-2.5");
  });
});

describe("lamportsToSol", () => {
  it("converts lamports to SOL", () => {
    expect(lamportsToSol(1_000_000_000n)).toBe("1");
    expect(lamportsToSol(2_500_000_000n)).toBe("2.5");
    expect(lamportsToSol(1n, 9)).toBe("0.000000001");
  });
});

describe("misc formatting", () => {
  it("formats bps as percent", () => {
    expect(formatBps(1_234)).toBe("12.34%");
    expect(formatBps(8_000, 0)).toBe("80%");
  });
  it("shortens addresses", () => {
    expect(shortenAddress("4sohRUrhAnm75sFwUbeE6tJHRQCNq5MMf4PEYEUi1WdD")).toBe("4soh…1WdD");
    expect(shortenAddress("abc")).toBe("abc");
  });
  it("computes percentages of bigint totals", () => {
    expect(percentOf(1n, 4n)).toBe(25);
    expect(percentOf(1n, 0n)).toBe(0);
  });
  it("formats unix timestamps and durations", () => {
    expect(formatUnixTime(0n)).toBe("—");
    expect(formatUnixTime(1_700_000_000n)).toBe("2023-11-14 22:13 UTC");
    expect(formatDuration(90_061)).toBe("1d 1h");
    expect(formatDuration(3_720)).toBe("1h 2m");
    expect(formatDuration(65)).toBe("1m 5s");
    expect(formatDuration(-5)).toBe("0s");
  });
});
