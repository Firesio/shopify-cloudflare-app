import { services } from "~/wiring/services";

/**
 * A public liveness and readiness probe: no session, no data about any shop. 200 with `{ ok: true }` when the Worker runs and
 * D1 answers; 503 when D1 does not (the one dependency a request cannot do without). Safe to call from an uptime monitor.
 */
export async function loader(): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  try {
    await services().env.DB.prepare("SELECT 1").first();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers });
  }
}
