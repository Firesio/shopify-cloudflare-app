import { describe, expect, it } from "vitest";
import { boundAdmin, loadShellDecoration, type ShellDecorationPorts } from "./shell-data.server";

type Logged = { event: string; shop: string; fields: Readonly<Record<string, unknown>> | undefined };

function harness(overrides: Partial<ShellDecorationPorts>) {
  const logged: Logged[] = [];
  const ports: ShellDecorationPorts = {
    persistIdentity: async () => ({ status: "recorded" }),
    timeZone: async () => "Europe/Madrid",
    log: async (event, shop, fields) => void logged.push({ event, shop, fields }),
    timeoutMs: 25,
    ...overrides,
  };
  return { ports, logged };
}

const never = () => new Promise<never>(() => undefined);

describe("loadShellDecoration", () => {
  it("returns the shop's zone and logs nothing when both lookups succeed", async () => {
    const { ports, logged } = harness({});
    await expect(loadShellDecoration("a.myshopify.com", ports)).resolves.toEqual({ timeZone: "Europe/Madrid" });
    expect(logged).toEqual([]);
  });

  it("falls back to UTC and logs when the zone lookup hangs past the timeout", async () => {
    const { ports, logged } = harness({ timeZone: never });
    await expect(loadShellDecoration("a.myshopify.com", ports)).resolves.toEqual({ timeZone: "UTC" });
    expect(logged).toEqual([{ event: "shell.time_zone_unavailable", shop: "a.myshopify.com", fields: { reason: "timeout" } }]);
  });

  it("falls back to UTC and logs the error name when the zone lookup throws (a Shopify network error)", async () => {
    const { ports, logged } = harness({ timeZone: async () => { throw new TypeError("fetch failed"); } });
    await expect(loadShellDecoration("a.myshopify.com", ports)).resolves.toEqual({ timeZone: "UTC" });
    expect(logged).toEqual([{ event: "shell.time_zone_unavailable", shop: "a.myshopify.com", fields: { reason: "error", errorName: "TypeError" } }]);
  });

  it("still returns the zone when only the identity write-through hangs or throws, and says so", async () => {
    const hung = harness({ persistIdentity: never });
    await expect(loadShellDecoration("a.myshopify.com", hung.ports)).resolves.toEqual({ timeZone: "Europe/Madrid" });
    expect(hung.logged).toEqual([{ event: "shell.identity_unavailable", shop: "a.myshopify.com", fields: { reason: "timeout" } }]);

    const thrown = harness({ persistIdentity: async () => { throw new Error("boom"); } });
    await expect(loadShellDecoration("a.myshopify.com", thrown.ports)).resolves.toEqual({ timeZone: "Europe/Madrid" });
    expect(thrown.logged).toEqual([{ event: "shell.identity_unavailable", shop: "a.myshopify.com", fields: { reason: "error", errorName: "Error" } }]);
  });

  it("logs a refused identity answer (a failed status is a value, not a throw)", async () => {
    const { ports, logged } = harness({ persistIdentity: async () => ({ status: "failed" }) });
    await loadShellDecoration("a.myshopify.com", ports);
    expect(logged).toEqual([{ event: "shell.identity_unavailable", shop: "a.myshopify.com", fields: { reason: "refused" } }]);
  });

  it("does not wait for a hung lookup longer than the timeout", async () => {
    const { ports } = harness({ timeZone: never, persistIdentity: never, timeoutMs: 40 });
    const started = performance.now();
    await loadShellDecoration("a.myshopify.com", ports);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("boundAdmin", () => {
  it("passes the signal to every Admin call", async () => {
    const seen: AbortSignal[] = [];
    const controller = new AbortController();
    const admin = boundAdmin({ graphql: async (_query, options) => { seen.push(options.signal); return new Response("{}"); } }, controller.signal);
    await admin.graphql("query { shop { id } }");
    expect(seen).toEqual([controller.signal]);
  });
});
