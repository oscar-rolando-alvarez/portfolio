import { describe, expect, it } from "vitest";
import { hash32, siteLocation } from "./geo";

// Same golden vectors as platform/tests/test_localization.py::GEO_GOLDEN.
const GOLDEN: Record<string, [number, number]> = {
  "310-260-1000-100000": [38.6447, -104.2014],
  "310-260-1003-100200": [35.9238, -101.3292],
  "262-01-1000-100005": [48.707, 8.5388],
};

describe("site geolocation (parity with the platform)", () => {
  it("hashes like the Python implementation", () => {
    expect(hash32("abc")).toBe(482950588);
    expect(hash32("")).toBe(2872998923);
  });

  it.each(Object.entries(GOLDEN))("places %s identically", (cell, expected) => {
    expect(siteLocation(cell)).toEqual(expected);
  });

  it("clusters cells of one tracking area", () => {
    const [a, b] = [siteLocation("310-260-1004-100260"), siteLocation("310-260-1004-100261")];
    expect(Math.abs(a[0] - b[0])).toBeLessThanOrEqual(0.8);
    expect(Math.abs(a[1] - b[1])).toBeLessThanOrEqual(1.1);
  });

  it("falls back for unknown country codes", () => {
    const [lat, lon] = siteLocation("999-99-1-1");
    expect(lat).toBeGreaterThan(-1);
    expect(lon).toBeGreaterThan(-1);
  });
});
