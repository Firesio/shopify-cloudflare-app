import { env } from "cloudflare:workers";
import { planMeters } from "@firesio/app/plans";
import { installShop } from "@firesio/app/preset/testing";
import { callCommand, fingerprintInput, grantListSchema, healthReportSchema, openTicketResultSchema, planListSchema, revokeGrantResultSchema, standingSchema, staffToolsDeclarationSchema, ticketPageSchema, ticketSchema, toolResultSchema, toolRowPageSchema } from "@firesio/portal-contract";
import { describe, expect, it } from "vitest";
import { PLANS } from "~/core/plans";
import { GENERAL_SETTINGS } from "~/core/settings";
import { firesio } from "~/firesio.server";
import { setupTestDatabase } from "~/test/database";

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
    await installShop(firesio, env, "admin-one.myshopify.com", 1_700_000_000_000);
    const known = await callCommand(() => admin().shops().getStanding({ account: account("admin-one.myshopify.com") }), standingSchema);
    expect(known).toEqual({ ok: true, value: { state: "active" } });
    const unknown = await callCommand(() => admin().shops().getStanding({ account: account("never-seen.myshopify.com") }), standingSchema);
    expect(unknown).toEqual({ ok: false, reason: "unknown account" });
  });

  it("blocks an account with blockAccount and reports the standing it left behind", async () => {
    await installShop(firesio, env, "admin-two.myshopify.com", 1_700_000_000_000);
    const blocked = await callCommand(() => admin().shops().blockAccount({ account: account("admin-two.myshopify.com"), requestId: "block-2", reason: "chargeback", actor: "staff_1" }), standingSchema);
    expect(blocked.ok && blocked.value.state).toBe("blocked");
    const again = await callCommand(() => admin().shops().getStanding({ account: account("admin-two.myshopify.com") }), standingSchema);
    expect(again.ok && again.value).toMatchObject({ state: "blocked", reason: "chargeback (by staff_1)" });
  });

  it("validates its input itself: a malformed account is a refusal, never a throw across the binding", async () => {
    const refused = await callCommand(() => admin().shops().getStanding({ account: { kind: "shopify_shop" } }), standingSchema);
    expect(refused.ok).toBe(false);
  });

  it("declares the groups the template supports (the portal reads a missing group as unsupported)", () => {
    // Not called over the binding: the plugin's RPC emulation reports a missing property as an uncaught exception of its own.
    const methods = new Set<string>();
    for (let proto: object | null = firesio.AdminApi.prototype; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) methods.add(name);
    }
    // Campaigns are ON: the team's announcements are service notices, transactional on the `notifications` stream over Cloudflare Email.
    expect([...methods]).toEqual(expect.arrayContaining(["shops", "billing", "support", "staffTools", "system", "campaigns"]));
  });
});

describe("the AdminApi entrypoint over a service binding: system", () => {
  it("answers health with the app alive, and says which deploy it is (the portal asks every five minutes and tells staff after two failures)", async () => {
    const health = await callCommand(() => admin().system().health({}), healthReportSchema);
    expect(health.ok && health.value.ok).toBe(true);
  });
});

describe("the AdminApi entrypoint over a service binding: staff tools", () => {
  const shop = "tools-shop.myshopify.com";

  it("describes one resource and one action, checked by the contract's own schema", async () => {
    const declared = await callCommand(() => admin().staffTools().describe({}), staffToolsDeclarationSchema);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    expect(declared.value.resources.map((resource) => resource.id)).toEqual(["settings_changes"]);
    expect(declared.value.actions.map((action) => action.id)).toEqual(["reset_general_settings"]);
  });

  it("runs the action once per requestId (a double click resets once and gets the first answer again), and the table lists what it changed", async () => {
    await installShop(firesio, env, shop, 1_700_000_000_000);
    const { settings } = firesio.services(env);
    await settings.save(shop, GENERAL_SETTINGS, { signature: "The team" }, { actor: "member:1", allows: () => true });
    const input = {};
    const context = { actor: "staff_1", account: account(shop), requestId: "reset-1", inputFingerprint: await fingerprintInput(input) };
    const first = await callCommand(() => admin().staffTools().run({ actionId: "reset_general_settings", input, context }), toolResultSchema);
    const again = await callCommand(() => admin().staffTools().run({ actionId: "reset_general_settings", input, context }), toolResultSchema);
    expect(first).toMatchObject({ ok: true, value: { message: "The general settings are back to their defaults." } });
    expect(again).toMatchObject({ ok: true, value: { replayed: true } });
    expect(await settings.get(shop, GENERAL_SETTINGS)).toMatchObject({ signature: "" });
    const listed = await callCommand(() => admin().staffTools().list({ resourceId: "settings_changes", account: account(shop) }), toolRowPageSchema);
    expect(listed.ok && listed.value.rows.map((row) => row.cells["key"])).toEqual(expect.arrayContaining(["general.signature"]));
  });

  it("refuses to list a table that is about one shop without one", async () => {
    const refused = await callCommand(() => admin().staffTools().list({ resourceId: "settings_changes" }), toolRowPageSchema);
    expect(refused.ok).toBe(false);
  });
});

describe("the AdminApi entrypoint over a service binding: billing", () => {
  it("lists the plans of the app, the ones PLANS declares and nothing else", async () => {
    const plans = await callCommand(() => admin().billing().plans({}), planListSchema);
    expect(plans.ok).toBe(true);
    if (!plans.ok) return;
    expect(plans.value.plans.map((plan) => plan.id).sort()).toEqual(Object.keys(PLANS.plans).sort());
  });

  it("refuses a gift for a shop it does not know and for a plan it does not have", async () => {
    await installShop(firesio, env, "admin-gift.myshopify.com", 1_700_000_000_000);
    expect(await admin().billing().grantPlan({ account: account("never-seen.myshopify.com"), planId: "free", requestId: "gift-unknown-account", reason: "x", actor: "staff_1" })).toEqual({ ok: false, reason: "unknown account" });
    expect(await admin().billing().grantPlan({ account: account("admin-gift.myshopify.com"), planId: "no-such-plan", requestId: "gift-unknown-plan", reason: "x", actor: "staff_1" })).toEqual({ ok: false, reason: "unknown plan" });
  });
});

describe("the AdminApi entrypoint over a service binding: plan gifts", () => {
  it("gives a plan, lists the gift and takes it back; revoking twice with one requestId answers as the first time", async () => {
    const shop = "admin-grants.myshopify.com";
    await installShop(firesio, env, shop, 1_700_000_000_000);
    const given = await admin().billing().grantPlan({ account: account(shop), planId: "free", requestId: "gift-1", reason: "launch gift", actor: "staff_1" });
    expect(given).toMatchObject({ ok: true, value: { planId: "free" } });
    const listed = await callCommand(() => admin().billing().grants({ account: account(shop) }), grantListSchema);
    expect(listed.ok && listed.value.grants).toHaveLength(1);
    if (!listed.ok) return;
    const grantId = listed.value.grants[0]?.grantId;
    const revoke = () => callCommand(() => admin().billing().revokeGrant({ account: account(shop), grantId, requestId: "revoke-1", reason: "ended", actor: "staff_1" }), revokeGrantResultSchema);
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
    await installShop(firesio, env, "admin-three.myshopify.com", 1_700_000_000_000);
    const input = { account: account("admin-three.myshopify.com"), requestId: "req-1", subject: "A call with the owner", body: "Following up on your mail.", category: "question", actor: "staff_1", actorName: "Sam" };
    const opened = await callCommand(() => admin().support().open(input), openTicketResultSchema);
    expect(opened.ok && opened.value.created).toBe(true);
    const repeat = await callCommand(() => admin().support().open(input), openTicketResultSchema);
    expect(repeat).toEqual(opened);
    if (!opened.ok) return;
    const page = await callCommand(() => admin().support().listTickets({ account: account("admin-three.myshopify.com") }), ticketPageSchema);
    expect(page.ok && page.value.tickets.map((ticket) => ticket.ticketId)).toEqual([opened.value.ticketId]);
    const ticket = await callCommand(() => admin().support().getTicket({ ticketId: opened.value.ticketId }), ticketSchema);
    expect(ticket.ok && ticket.value.messages.map((message) => message.author)).toEqual(["staff"]);
  });

  it("does not show a shop another shop's tickets", async () => {
    await installShop(firesio, env, "admin-four.myshopify.com", 1_700_000_000_000);
    await installShop(firesio, env, "admin-five.myshopify.com", 1_700_000_000_000);
    await admin().support().open({ account: account("admin-four.myshopify.com"), requestId: "req-4", subject: "Four", body: "Only four.", category: "bug", actor: "staff_1" });
    const page = await callCommand(() => admin().support().listTickets({ account: account("admin-five.myshopify.com") }), ticketPageSchema);
    expect(page.ok && page.value.tickets).toEqual([]);
  });
});

describe("the open-ticket meter of the plans page", () => {
  it("counts the open tickets of the shop it is asked about, from the database, and never another shop's", async () => {
    await installShop(firesio, env, "meter-one.myshopify.com", 1_700_000_000_000);
    await installShop(firesio, env, "meter-two.myshopify.com", 1_700_000_000_000);
    await admin().support().open({ account: account("meter-one.myshopify.com"), requestId: "req-meter", subject: "One", body: "Only one.", category: "question", actor: "staff_1" });
    const source = planMeters(firesio.services(env).catalogue).find((meter) => meter.key === "tickets.max")?.source;
    expect(source?.kind).toBe("count");
    if (source?.kind !== "count") return;
    const at = { now: 1_700_000_000_000, window: null };
    expect(await source.count("meter-one.myshopify.com", at)).toBe(1);
    expect(await source.count("meter-two.myshopify.com", at)).toBe(0);
  });
});
