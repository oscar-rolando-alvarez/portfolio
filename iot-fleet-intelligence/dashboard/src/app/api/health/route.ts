export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok", service: "fleetintel-dashboard" }, { headers: { "cache-control": "no-store" } });
}
