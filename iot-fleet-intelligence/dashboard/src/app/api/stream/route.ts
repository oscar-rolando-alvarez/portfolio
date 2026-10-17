/**
 * Same-origin SSE proxy to the live gateway. The tenant API key lives only in
 * the server environment (GATEWAY_API_KEY) and is attached here, so browsers
 * never see it and the gateway can stay on a private network.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function GET(req: Request): Promise<Response> {
  const base = process.env.GATEWAY_URL;
  if (!base) return Response.json({ error: "live gateway not configured" }, { status: 503 });
  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant") ?? "";
  const upstream = new URL("/v1/stream", base);
  if (TENANT_RE.test(tenant)) upstream.searchParams.set("tenant", tenant);
  const every = url.searchParams.get("every");
  if (every && /^\d{1,2}$/.test(every)) upstream.searchParams.set("every", every);

  const headers: HeadersInit = { accept: "text/event-stream" };
  if (process.env.GATEWAY_API_KEY) headers["x-api-key"] = process.env.GATEWAY_API_KEY;
  let res: Response;
  try {
    res = await fetch(upstream, { headers, signal: req.signal, cache: "no-store" });
  } catch {
    return Response.json({ error: "gateway unreachable" }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    return Response.json(
      { error: `gateway responded ${res.status}` },
      { status: res.status === 401 || res.status === 403 ? res.status : 502 },
    );
  }
  return new Response(res.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
