import type { CostReport } from "./model";

interface ScenarioLike {
  devices: number;
  interval: number;
  payload: number;
  batch: number;
  llmShare: number;
  tier: string;
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Machine-friendly CSV (dot decimals, USD) of the scenario inputs and every line item. */
export function scenarioCsv(s: ScenarioLike, r: CostReport): string {
  const lines: (string | number)[][] = [
    ["section", "key", "value", "unit", "unit_price_usd", "monthly_usd"],
    ["scenario", "devices", s.devices, "devices", "", ""],
    ["scenario", "report_interval_seconds", s.interval, "s", "", ""],
    ["scenario", "payload_bytes", s.payload, "B", "", ""],
    ["scenario", "readings_per_message", s.batch, "", "", ""],
    ["scenario", "llm_share", s.llmShare, "", "", ""],
    ["scenario", "model_tier", s.tier, "", "", ""],
    ["scenario", "pricing_version", r.pricingVersion, "", "", ""],
    ...r.lineItems.map((li) => [li.category, li.item, li.quantity.toFixed(4), li.unit, li.unitPrice, li.monthlyUsd.toFixed(2)]),
    ["total", "monthly_usd", "", "", "", r.totalUsd.toFixed(2)],
    ["total", "per_device_usd", "", "", "", r.perDeviceUsd.toFixed(6)],
  ];
  return lines.map((l) => l.map(esc).join(",")).join("\n") + "\n";
}
