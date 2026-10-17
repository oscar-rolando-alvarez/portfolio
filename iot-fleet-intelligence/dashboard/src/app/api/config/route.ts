export const dynamic = "force-dynamic";

/** Tells the browser whether a live gateway is wired up (no secrets, no URLs). */
export function GET(): Response {
  const liveAvailable = Boolean(process.env.GATEWAY_URL);
  const requested = process.env.DASHBOARD_DEFAULT_MODE;
  const defaultMode = requested === "live" && liveAvailable ? "live" : requested === "demo" ? "demo" : liveAvailable ? "live" : "demo";
  return Response.json({ liveAvailable, defaultMode }, { headers: { "cache-control": "no-store" } });
}
