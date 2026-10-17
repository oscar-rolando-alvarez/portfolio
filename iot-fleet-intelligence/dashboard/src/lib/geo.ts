/**
 * TypeScript twin of platform `fleetintel.enrichment.providers.site_location`:
 * deterministic pseudo-geolocation of a cell site, clustered per tracking area.
 * Golden vectors in geo.test.ts are shared with the Python test suite, so the
 * map and the incident enrichment always agree on where a cell is.
 */

const COUNTRY_BOXES: Record<string, [number, number, number, number]> = {
  "310": [33.0, 45.0, -118.0, -77.0],
  "262": [47.5, 54.5, 6.5, 14.5],
  "234": [50.5, 55.5, -4.5, 1.0],
  "208": [43.5, 50.5, -1.0, 7.0],
  "222": [38.0, 45.5, 8.0, 16.0],
};

const encoder = new TextEncoder();

/** 32-bit FNV-1a + murmur3 finalizer over UTF-8 bytes (unsigned). */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of encoder.encode(text)) {
    h = Math.imul(h ^ b, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const u32 = (seed: string, salt: string) => hash32(`${salt}:${seed}`) / 2 ** 32;

/** Python's round() is banker's rounding on exact halves; coordinates never hit exact halves in practice. */
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function siteLocation(cellId: string): [lat: number, lon: number] {
  const [mcc = "", mnc = "", tac = "0"] = cellId.split("-");
  const [lat0, lat1, lon0, lon1] = COUNTRY_BOXES[mcc] ?? [0, 1, 0, 1];
  const area = `${mcc}-${mnc}-${Number(tac)}`;
  const clat = lat0 + (lat1 - lat0) * (0.1 + 0.8 * u32(area, "tac-lat"));
  const clon = lon0 + (lon1 - lon0) * (0.1 + 0.8 * u32(area, "tac-lon"));
  const lat = clat + (u32(cellId, "lat") - 0.5) * 0.8;
  const lon = clon + (u32(cellId, "lon") - 0.5) * 1.1;
  return [round4(lat), round4(lon)];
}

export const COUNTRY_OF_MCC: Record<string, string> = { "310": "US", "262": "DE", "234": "GB", "208": "FR", "222": "IT" };
