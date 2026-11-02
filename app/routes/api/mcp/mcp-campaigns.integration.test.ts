import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";
import { RouterContextProvider, type ActionFunctionArgs } from "react-router";
import { campaignRecipients, campaigns, shops } from "~/db/schema";
import { chunk } from "~/lib/chunk";
import { hashPassword } from "~/lib/password";
import { TOOL_CATALOG } from "~/mcp/catalog";
import { AdminUserRepo } from "~/models/admin-users.server";
import { runWithRequestContext } from "~/request-context.server";
import { createPersonalAccessToken } from "~/services/mcp/tokens.server";
import { setupTestDatabase } from "~/test/db";
import { testRandomBytes } from "~/test/fake-runtime";
import { mcpAuditLogs } from "~/wiring.server";
import { action as mcpAction } from "../mcp";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const asActionArgs = (request: Request): ActionFunctionArgs => ({
  request,
  params: {},
  url: new URL(request.url),
  pattern: new URL(request.url).pathname,
  context: new RouterContextProvider(),
});

const STAFF_EMAIL = "staff-campaigns@firesio.app";
const BODY = "Next week a big update ships.\n\nNothing changes until you open the dashboard.";
const SECRET_PHRASE = "a big update ships";
const DRAFT = { name: "Big update", subject: "A big update is coming", body: BODY, ctaLabel: "See what is new", ctaUrl: "https://firesio.app/news" };

const WRITE = ["mcp:read", "mcp:campaigns:write"];
const SEND_ONLY = ["mcp:campaigns:send"];

async function tokenWith(scopes: readonly string[]): Promise<string> {
  const admins = new AdminUserRepo();
  const existing = await admins.findByEmailWithHash(STAFF_EMAIL);
  const admin =
    existing ??
    (await admins.create({
      id: "admin-campaign-mcp",
      email: STAFF_EMAIL,
      name: "Campaign Staff",
      passwordHash: await hashPassword("Pass12345678!", testRandomBytes),
      role: "admin",
      now: Date.now(),
    }));
  const { rawToken } = await createPersonalAccessToken({ label: "campaigns", adminUserId: admin.id, adminEmail: admin.email, scopes });
  return rawToken;
}

interface ToolReply {
  readonly isError: boolean;
  readonly text: string;
  // JSON.parse is `any`: callers read fields they assert on, and a wrong shape fails the assertion.
  readonly json: Record<string, unknown>;
}

async function rpc(token: string, method: string, params: unknown) {
  const request = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const response = await mcpAction(asActionArgs(request));
  expect(response.status).toBe(200);
  return response.json() as Promise<{ result?: { tools?: { name: string }[]; isError?: boolean; content?: { text: string }[] } }>;
}

async function call(token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolReply> {
  const body = await rpc(token, "tools/call", { name, arguments: args });
  const text = body.result?.content?.[0]?.text ?? "";
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // An error reply is plain text, not JSON.
  }
  return { isError: body.result?.isError === true, text, json };
}

async function seedShops(count: number): Promise<void> {
  const rows = Array.from({ length: count }, (_, index) => ({
    shop: `m${index + 1}.myshopify.com`,
    name: `Merchant ${index + 1}`,
    email: `owner${index + 1}@merchant-mail.test`,
    installedAt: 1_000,
  }));
  for (const slice of chunk(rows, 10)) await db.insert(shops).values([...slice]);
}

const recipientRows = async (id: string) => (await db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, id))).length;
const statusOf = async (id: string) => (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0]?.status;

async function createDraftVia(token: string, extra: Record<string, unknown> = {}) {
  const created = await call(token, "create_campaign", { ...DRAFT, ...extra });
  const campaign = created.json.campaign;
  const id = typeof campaign === "object" && campaign !== null && "id" in campaign ? String(campaign.id) : "";
  return { created, id };
}

describe("MCP campaign tools over the real HTTP bridge", () => {
  it("lists the campaign tools for any valid token, and the catalogue documents exactly those", async () => {
    await inRequest(async () => {
      const readOnly = await tokenWith(["mcp:read"]);
      const names = ((await rpc(readOnly, "tools/list", {})).result?.tools ?? []).map((tool) => tool.name);
      const documented = TOOL_CATALOG.find((group) => group.domain === "Campaigns")?.tools ?? [];
      expect(documented.length).toBe(11);
      for (const tool of documented) {
        expect(names).toContain(tool.name);
        expect(tool.isMutation).toBe(tool.scope !== "mcp:read");
      }
      expect(documented.find((tool) => tool.name === "start_campaign")?.scope).toBe("mcp:campaigns:send");
      expect(documented.filter((tool) => tool.scope === "mcp:campaigns:write").length).toBe(7);
    });
  });

  it("lets a read-only token read and size an audience but not create", async () => {
    await inRequest(async () => {
      await seedShops(3);
      const readOnly = await tokenWith(["mcp:read"]);

      const preview = await call(readOnly, "preview_campaign_audience", {});
      expect(preview.isError).toBe(false);
      expect(preview.json.preview).toMatchObject({ matched: 3, recipients: 3, unsubscribed: 0, withoutAddress: 0 });
      expect((await call(readOnly, "list_campaigns")).json.campaigns).toEqual([]);

      const refused = await call(readOnly, "create_campaign", DRAFT);
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain("Forbidden");
      expect(refused.text).toContain("mcp:campaigns:write");
      expect(await db.select().from(campaigns)).toEqual([]);
    });
  });

  it("lets a write token draft, preview, edit, test, pause and delete, but never start", async () => {
    await inRequest(async () => {
      await seedShops(4);
      const write = await tokenWith(WRITE);
      const { created, id } = await createDraftVia(write);
      expect(created.json).toMatchObject({ ok: true, status: "draft", preview: { recipients: 4 } });
      // The token's label is not an address: the announcement is credited to the staff account that owns the token.
      expect((await call(write, "get_campaign", { id })).json).toMatchObject({ campaign: { createdByEmail: STAFF_EMAIL } });
      expect(String(created.json.next)).toContain("start_campaign");
      expect(created.json.audience).toMatchObject({ filter: { kind: "real", installedAfter: null, installedBefore: null } });

      const updated = await call(write, "update_campaign", { id, subject: "Updated subject", audience: { kind: "all", installedBefore: "2030-01-01" } });
      expect(updated.json).toMatchObject({ ok: true, campaign: { subject: "Updated subject", name: "Big update", ctaLabel: "See what is new" } });
      expect(updated.json.audience).toMatchObject({ filter: { kind: "all", installedBefore: "2030-01-01" } });

      const test = await call(write, "send_campaign_test", { id });
      expect(test.json).toMatchObject({ ok: true, delivered: false, sentTo: STAFF_EMAIL });

      const paused = await call(write, "pause_campaign", { id });
      expect(paused.json).toMatchObject({ ok: false, reason: "illegal" });

      const start = await call(write, "start_campaign", { id, expectedRecipients: 4 });
      expect(start.isError).toBe(true);
      expect(start.text).toContain("Forbidden");
      expect(start.text).toContain("mcp:campaigns:send");
      expect(await statusOf(id)).toBe("draft");
      expect(await recipientRows(id)).toBe(0);

      const gone = await call(write, "delete_campaign", { id });
      expect(gone.json).toMatchObject({ ok: true, deleted: id });
      expect(await call(write, "get_campaign", { id })).toMatchObject({ json: { ok: false, reason: "not_found" } });
    });
  });

  it("refuses to start when expectedRecipients is not the current size, and sends nothing", async () => {
    await inRequest(async () => {
      await seedShops(5);
      const write = await tokenWith(WRITE);
      const send = await tokenWith(SEND_ONLY);
      const { id } = await createDraftVia(write);

      const wrong = await call(send, "start_campaign", { id, expectedRecipients: 3 });
      expect(wrong.isError).toBe(false);
      expect(wrong.json).toMatchObject({ ok: false, reason: "audience_changed", recipients: 5, expectedRecipients: 3 });
      expect(await statusOf(id)).toBe("draft");
      expect(await recipientRows(id)).toBe(0);

      const missing = await rpc(send, "tools/call", { name: "start_campaign", arguments: { id } });
      expect(missing.result?.isError).toBe(true);
      expect(await statusOf(id)).toBe("draft");
      expect(await recipientRows(id)).toBe(0);
    });
  });

  it("starts with the approved number, fixes the recipients, freezes the draft and bounds the recipient sample", async () => {
    await inRequest(async () => {
      await seedShops(60);
      const write = await tokenWith(WRITE);
      const send = await tokenWith(SEND_ONLY);
      const { created, id } = await createDraftVia(write);
      expect(created.json).toMatchObject({ preview: { recipients: 60 } });

      // A send-only token cannot draft: sending and preparing are separate powers.
      expect((await call(send, "create_campaign", DRAFT)).isError).toBe(true);

      const started = await call(send, "start_campaign", { id, expectedRecipients: 60 });
      expect(started.json).toMatchObject({ ok: true, status: "sending", recipients: 60 });
      expect(await statusOf(id)).toBe("sending");
      expect(await recipientRows(id)).toBe(60);

      const frozen = await call(write, "update_campaign", { id, subject: "Too late" });
      expect(frozen.json).toMatchObject({ ok: false, reason: "not_draft" });
      expect((await call(write, "delete_campaign", { id })).json).toMatchObject({ ok: false, reason: "not_draft" });
      expect((await call(send, "start_campaign", { id, expectedRecipients: 60 })).json).toMatchObject({ ok: false, reason: "not_draft" });

      const detail = await call(write, "get_campaign", { id, recipientStatus: "pending", recipientLimit: 50 });
      expect(detail.json).toMatchObject({ ok: true, counts: { pending: 60, sent: 0 }, percentDone: 0, campaign: { status: "sending", recipientCount: 60 } });
      expect((detail.json.recipients as unknown[]).length).toBe(50);
      const overview = await call(write, "get_campaign", { id });
      expect((overview.json.recipients as unknown[]).length).toBeLessThanOrEqual(50);

      const paused = await call(write, "pause_campaign", { id });
      expect(paused.json).toMatchObject({ ok: true, status: "paused" });
      const resumed = await call(write, "resume_campaign", { id });
      expect(resumed.json).toMatchObject({ ok: true, status: "sending" });
      const cancelled = await call(write, "cancel_campaign", { id });
      expect(cancelled.json).toMatchObject({ ok: true, status: "cancelled" });
      expect(String(cancelled.json.next)).toContain("cannot be recalled");
      expect((await call(write, "get_campaign", { id })).json).toMatchObject({ counts: { pending: 0, skipped: 60 } });

      const listed = await call(write, "list_campaigns", { status: "cancelled" });
      expect((listed.json.campaigns as { id: string }[]).map((row) => row.id)).toEqual([id]);
      expect((await call(write, "list_campaigns", { status: "draft" })).json.campaigns).toEqual([]);
    });
  });

  it("answers invalid content and dates with per-field faults and writes nothing", async () => {
    await inRequest(async () => {
      const write = await tokenWith(WRITE);
      const bad = await call(write, "create_campaign", { name: "x", subject: " ", body: BODY, ctaLabel: "Go", ctaUrl: "" });
      expect(bad.isError).toBe(false);
      expect(bad.json).toMatchObject({ ok: false, reason: "invalid" });
      const faults = (bad.json.errors as { field: string; fault: string }[]).map((error) => `${error.field}:${error.fault}`);
      expect(faults.sort()).toEqual(["ctaUrl:buttonIncomplete", "subject:required"]);

      const http = await call(write, "create_campaign", { ...DRAFT, ctaUrl: "http://firesio.app/news" });
      expect(http.json.errors).toEqual([expect.objectContaining({ field: "ctaUrl", fault: "invalidUrl" })]);

      const date = await call(write, "create_campaign", { ...DRAFT, audience: { installedAfter: "2026-02-31" } });
      expect(date.json.errors).toEqual([expect.objectContaining({ field: "audience.installedAfter", fault: "invalidDate" })]);
      expect(await db.select().from(campaigns)).toEqual([]);
    });
  });

  it("audits which tool ran, as a mutation, without the words or any merchant address", async () => {
    await inRequest(async () => {
      await seedShops(2);
      const write = await tokenWith(WRITE);
      const send = await tokenWith(SEND_ONLY);
      const { id } = await createDraftVia(write);
      await call(send, "start_campaign", { id, expectedRecipients: 2 });
      await call(write, "get_campaign", { id });

      await vi.waitFor(async () => {
        const names = (await mcpAuditLogs().listRecentLogs(50)).map((row) => row.toolName);
        expect(names).toEqual(expect.arrayContaining(["create_campaign", "start_campaign", "get_campaign"]));
      });
      const logs = await mcpAuditLogs().listRecentLogs(50);
      expect(logs.find((row) => row.toolName === "create_campaign")).toMatchObject({ isMutation: true, ok: true });
      expect(logs.find((row) => row.toolName === "start_campaign")).toMatchObject({ isMutation: true, ok: true });
      expect(logs.find((row) => row.toolName === "get_campaign")).toMatchObject({ isMutation: false });
      const dump = JSON.stringify(logs);
      expect(dump).not.toContain(SECRET_PHRASE);
      expect(dump).not.toContain(DRAFT.subject);
      expect(dump).not.toContain("merchant-mail.test");
    });
  });
});
