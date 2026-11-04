import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { AdminUserRepo } from "~/models/admin-users.server";
import { McpOAuthRepo } from "~/models/mcp.server";
import { createAdmin } from "~/services/admin-management.server";
import { createAdminSession, HOME_PATH } from "~/services/admin-auth.server";
import { registerDynamicClient } from "~/services/mcp/oauth.server";
import { sha256 } from "~/domain/mcp/tokens";
import { fakeRuntime } from "~/test/fake-runtime";
import { defined } from "~/test/defined";
import { action, loader } from "./authorize";

setupTestDatabase();
const authDeps = { users: new AdminUserRepo(), runtime: fakeRuntime() };
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const CALLBACK = "https://agent.example.org/cb";

async function signIn() {
  const created = await createAdmin({ name: "Test", email: "owner@workmanjsc.vn", password: "a-long-enough-password", role: "owner" }, authDeps);
  if (!created.ok) throw new Error(`fixture: ${created.reason}`);
  const header = (await createAdminSession(created.value.id, HOME_PATH)).headers.get("Set-Cookie");
  return { cookie: defined(header?.split(";")[0]) };
}

function args(request: Request) {
  const url = new URL(request.url);
  return { request, params: {}, context: new RouterContextProvider(), url, pattern: url.pathname };
}

function post(cookie: string, fields: URLSearchParams) {
  return args(
    new Request("https://example.test/api/oauth/authorize", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: fields,
    }),
  );
}

describe("OAuth consent: choosing scopes", () => {
  it("a dynamic client registered before a scope existed is still offered it", async () => {
    await inRequest(async () => {
      const staff = await signIn();
      const client = await new McpOAuthRepo().createClient({
        id: "cli-old",
        clientId: "mcp_cid_old",
        clientName: "Old agent",
        clientType: "public",
        registrationType: "dynamic",
        redirectUris: [CALLBACK],
        allowedScopes: ["mcp:read", "mcp:tickets:write", "mcp:shops:read"],
        createdAt: Date.now(),
      });
      const query = new URLSearchParams({ client_id: client.clientId, redirect_uri: CALLBACK, response_type: "code", scope: "mcp:read mcp:campaigns:send mcp:admin", code_challenge: "c" });
      const opened = await loader(args(new Request(`https://example.test/api/oauth/authorize?${query}`, { headers: { Cookie: staff.cookie } })));
      expect(opened).toMatchObject({ ok: true, scopes: ["mcp:read", "mcp:campaigns:send"] });
      expect(opened.ok ? opened.choices : []).toContain("mcp:campaigns:write");
    });
  });

  it("offers a dynamically registered client every scope but admin, grants only the ticked ones, and refuses none ticked", async () => {
    await inRequest(async () => {
      const staff = await signIn();
      const client = await registerDynamicClient({ clientName: "Claude Code", redirectUris: [CALLBACK] });
      const query = new URLSearchParams({ client_id: client.clientId, redirect_uri: CALLBACK, response_type: "code", scope: "mcp:read", code_challenge: "c" });
      const opened = await loader(args(new Request(`https://example.test/api/oauth/authorize?${query}`, { headers: { Cookie: staff.cookie } })));
      expect(opened).toMatchObject({ ok: true, scopes: ["mcp:read"] });
      const choices = opened.ok ? opened.choices : [];
      expect(choices).toContain("mcp:campaigns:write");
      expect(choices).toContain("mcp:campaigns:send");
      expect(choices).not.toContain("mcp:admin");

      const ticked = new URLSearchParams({ client_id: client.clientId, redirect_uri: CALLBACK, intent: "authorize", code_challenge: "c" });
      ticked.append("scope", "mcp:read");
      ticked.append("scope", "mcp:campaigns:write");
      ticked.append("scope", "mcp:admin");
      const granted = await action(post(staff.cookie, ticked));
      const code = new URL(defined((granted as Response).headers.get("Location"))).searchParams.get("code");
      const row = await new McpOAuthRepo().findAuthCodeByHash(await sha256(defined(code)));
      expect(row?.scope).toBe("mcp:read mcp:campaigns:write");

      const none = new URLSearchParams({ client_id: client.clientId, redirect_uri: CALLBACK, intent: "authorize", code_challenge: "c" });
      expect(((await action(post(staff.cookie, none))) as Response).status).toBe(400);
    });
  });

  it("a forged post cannot redirect to an unregistered URI, on allow or on cancel", async () => {
    await inRequest(async () => {
      const staff = await signIn();
      const client = await registerDynamicClient({ clientName: "Claude Code", redirectUris: [CALLBACK] });
      for (const intent of ["authorize", "deny"]) {
        const fields = new URLSearchParams({ client_id: client.clientId, redirect_uri: "https://evil.example.net/cb", intent, code_challenge: "c" });
        fields.append("scope", "mcp:read");
        expect(((await action(post(staff.cookie, fields))) as Response).status).toBe(400);
      }
    });
  });
});
