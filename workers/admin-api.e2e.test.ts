import { env } from "cloudflare:workers";
import { callCommand, grantListSchema, openTicketResultSchema, planListSchema, revokeGrantResultSchema, standingSchema, ticketPageSchema, ticketSchema } from "@firesio/portal-contract";
import { describe, expect, it } from "vitest";
import { PLANS } from "~/core/plans";
import { firesio } from "~/firesio.server";
import { setupTestDatabase } from "~/test/database";
import { installShop } from "~/test/e2e";

setupTestDatabase();

const account = (id: string) => ({ kind: "shopify_shop", id }) as const;
const admin = () => env.PORTAL_ADMIN_API;

/**
 * The portal's way in: `env.PORTAL_ADMIN_API` is a service binding to this Worker's `AdminApi` entrypoint (vitest.config.ts, the same
 * shape the portal declares with `entrypoint: "AdminApi"`), and every call goes over RPC through the contract's `callCommand`,
 * exactly as the portal's adapter does. Nothing here imports the handlers.
 */
describe("the AdminApi entrypoint over a service binding: shops", () => {
  it("answers getStanding for an installed shop, and 'unknown account' for one it never saw", async () => {
    await installShop("admin-one.myshopify.com", 1_700_000_000_000);
    const known = await callCommand(() => admin().shops().getStanding({ account: account("admin-one.myshopify.com") }), standingSchema);
    expect(known).toEqual({ ok: true, value: { state: "active" } });
    const unknown = await callCommand(() => admin().shops().getStanding({ account: account("never-seen.myshopify.com") }), standingSchema);
    expect(unknown).toEqual({ ok: false, reason: "unknown account" });
  });

  it("blocks an account with blockAccount and reports the standing it left behind", async () => {
    await installShop("admin-two.myshopify.com", 1_700_000_000_000);
    const blocked = await callCommand(() => admin().shops().blockAccount({ account: account("admin-two.myshopify.com"), reason: "chargeback", actor: "staff_1" }), standingSchema);
    expect(blocked.ok && blocked.value.state).toBe("blocked");
    const again = await callCommand(() => admin().shops().getStanding({ account: account("admin-two.myshopify.com") }), standingSchema);
    expect(again.ok && again.value).toMatchObject({ state: "blocked", reason: "chargeback (by staff_1)" });
  });

  it("validates its input itself: a malformed account is a refusal, never a throw across the binding", async () => {
    const refused = await callCommand(() => admin().shops().getStanding({ account: { kind: "shopify_shop" } }), standingSchema);
    expect(refused.ok).toBe(false);
  });

  it("declares the groups the template supports and not the optional one it does not adopt (the portal reads a missing group as unsupported)", () => {
    // Not called over the binding: the plugin's RPC emulation reports a missing property as an uncaught exception of its own.
    const methods = new Set<string>();
    for (let proto: object | null = firesio.AdminApi.prototype; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) methods.add(name);
    }
    expect([...methods]).toEqual(expect.arrayContaining(["shops", "billing", "support"]));
    expect(methods.has("campaigns")).toBe(false);
  });
});

describe("the AdminApi entrypoint over a service binding: billing", () => {
  it("lists the plans of the app, the ones PLANS declares and nothing else", async () => {
    const plans = await callCommand(() => admin().billing().plans({}), planListSchema);
    expect(plans.ok).toBe(true);
    if (!plans.ok) return;
    expect(plans.value.plans.map((plan) => plan.id).sort()).toEqual(Object.keys(PLANS).sort());
  });

  it("refuses a gift for a shop it does not know and for a plan it does not have", async () => {
    await installShop("admin-gift.myshopify.com", 1_700_000_000_000);
    expect(await admin().billing().grantPlan({ account: account("never-seen.myshopify.com"), planId: "free", reason: "x", actor: "staff_1" })).toEqual({ ok: false, reason: "unknown account" });
    expect(await admin().billing().grantPlan({ account: account("admin-gift.myshopify.com"), planId: "no-such-plan", reason: "x", actor: "staff_1" })).toEqual({ ok: false, reason: "unknown plan" });
  });
});

describe("the AdminApi entrypoint over a service binding: plan gifts", () => {
  it("gives a plan, lists the gift and takes it back; revoking twice answers as the first time", async () => {
    const shop = "admin-grants.myshopify.com";
    await installShop(shop, 1_700_000_000_000);
    const given = await admin().billing().grantPlan({ account: account(shop), planId: "free", reason: "launch gift", actor: "staff_1" });
    expect(given).toMatchObject({ ok: true, value: { planId: "free" } });
    const listed = await callCommand(() => admin().billing().grants({ account: account(shop) }), grantListSchema);
    expect(listed.ok && listed.value.grants).toHaveLength(1);
    if (!listed.ok) return;
    const grantId = listed.value.grants[0]?.grantId;
    const revoke = () => callCommand(() => admin().billing().revokeGrant({ account: account(shop), grantId, reason: "ended", actor: "staff_1" }), revokeGrantResultSchema);
    const first = await revoke();
    const second = await revoke();
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    const after = await callCommand(() => admin().billing().grants({ account: account(shop) }), grantListSchema);
    expect(after.ok && after.value.grants.map((grant) => grant.revokedAt !== undefined)).toEqual([true]);
  });
});

describe("the AdminApi entrypoint over a service binding: support", () => {
  it("opens a ticket for an installed shop once per requestId, lists it and reads it back", async () => {
    await installShop("admin-three.myshopify.com", 1_700_000_000_000);
    const input = { account: account("admin-three.myshopify.com"), requestId: "req-1", subject: "A call with the owner", body: "Following up on your mail.", category: "question", actor: "staff_1", actorName: "Sam" };
    const opened = await callCommand(() => admin().support().open(input), openTicketResultSchema);
    expect(opened.ok && opened.value.created).toBe(true);
    const repeat = await callCommand(() => admin().support().open(input), openTicketResultSchema);
    expect(repeat.ok && repeat.value.created).toBe(false);
    if (!opened.ok) return;
    const page = await callCommand(() => admin().support().listTickets({ account: account("admin-three.myshopify.com") }), ticketPageSchema);
    expect(page.ok && page.value.tickets.map((ticket) => ticket.ticketId)).toEqual([opened.value.ticketId]);
    const ticket = await callCommand(() => admin().support().getTicket({ ticketId: opened.value.ticketId }), ticketSchema);
    expect(ticket.ok && ticket.value.messages.map((message) => message.author)).toEqual(["staff"]);
  });

  it("does not show a shop another shop's tickets", async () => {
    await installShop("admin-four.myshopify.com", 1_700_000_000_000);
    await installShop("admin-five.myshopify.com", 1_700_000_000_000);
    await admin().support().open({ account: account("admin-four.myshopify.com"), requestId: "req-4", subject: "Four", body: "Only four.", category: "bug", actor: "staff_1" });
    const page = await callCommand(() => admin().support().listTickets({ account: account("admin-five.myshopify.com") }), ticketPageSchema);
    expect(page.ok && page.value.tickets).toEqual([]);
  });
});
