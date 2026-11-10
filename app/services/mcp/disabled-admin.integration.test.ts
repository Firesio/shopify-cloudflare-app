import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { AdminUserRepo } from "~/models/admin-users.server";
import { McpOAuthRepo, McpTokenRepo } from "~/models/mcp.server";
import { createCodeChallenge } from "~/domain/mcp/pkce";
import { sha256 } from "~/domain/mcp/tokens";
import { hashPassword } from "~/lib/password";
import { fakeRuntime, testRandomBytes } from "~/test/fake-runtime";
import { removeAdmin, setAdminStatus } from "~/services/admin-management.server";
import { createPersonalAccessToken, verifyBearerToken } from "./tokens.server";
import { exchangeOAuthToken, issueAuthorizationCode, registerDynamicClient } from "./oauth.server";
import { action as mcpAction } from "~/routes/api/mcp";
import { loader as healthLoader } from "~/routes/api/v1/health";

setupTestDatabase();

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const runtime = fakeRuntime();
const REDIRECT = "https://agent.example.org/callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

const deps = () => ({ users: new AdminUserRepo(), tokens: new McpTokenRepo(), runtime });
const mcpArgs = (request: Request): ActionFunctionArgs => ({ request, params: {}, url: new URL(request.url), pattern: new URL(request.url).pathname, context: new RouterContextProvider() });
const loaderArgs = (request: Request): LoaderFunctionArgs => ({ request, params: {}, url: new URL(request.url), pattern: new URL(request.url).pathname, context: new RouterContextProvider() });

async function seedAdmin(id: string) {
  return new AdminUserRepo().create({
    id,
    email: `${id}@staff.test`,
    name: id,
    passwordHash: await hashPassword("Pass12345678!", testRandomBytes),
    role: "admin",
    now: Date.now(),
  });
}

async function patFor(admin: { id: string; email: string }): Promise<string> {
  const { rawToken } = await createPersonalAccessToken({ label: `pat ${admin.id}`, adminUserId: admin.id, adminEmail: admin.email, scopes: ["mcp:read"] });
  return rawToken;
}

/** A full authorization-code exchange for the admin: returns the raw access and refresh tokens. */
async function oauthTokensFor(adminId: string, clientId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const code = await issueAuthorizationCode({
    clientId,
    adminUserId: adminId,
    redirectUri: REDIRECT,
    scope: "mcp:read",
    codeChallenge: await createCodeChallenge(VERIFIER),
    codeChallengeMethod: "S256",
  });
  const exchanged = await exchangeOAuthToken({ grantType: "authorization_code", clientId, code, codeVerifier: VERIFIER, redirectUri: REDIRECT });
  if (!exchanged.ok) throw new Error(`fixture failed: ${exchanged.description}`);
  return { accessToken: exchanged.accessToken, refreshToken: exchanged.refreshToken };
}

const bearer = (token: string) => `Bearer ${token}`;
const tools = (token: string) => new Request("http://localhost/api/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: bearer(token) },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});

describe("a disabled staff account loses its API access", () => {
  it("refuses the personal access token, the MCP call and the REST call at once, even if nothing was revoked", async () => {
    await inRequest(async () => {
      const leaver = await seedAdmin("leaver");
      const stayer = await seedAdmin("stayer");
      const leaverPat = await patFor(leaver);
      const stayerPat = await patFor(stayer);
      expect(await verifyBearerToken(bearer(leaverPat))).not.toBeNull();

      // Straight to the repository: nothing is revoked, so only the authentication check can stop the token.
      await new AdminUserRepo().setStatus(leaver.id, "disabled", Date.now());

      expect(await verifyBearerToken(bearer(leaverPat))).toBeNull();
      expect((await mcpAction(mcpArgs(tools(leaverPat)))).status).toBe(401);
      await expect(healthLoader(loaderArgs(new Request("http://localhost/api/v1/health", { headers: { Authorization: bearer(leaverPat) } }))))
        .rejects.toSatisfy((thrown: unknown) => thrown instanceof Response && thrown.status === 401);

      expect(await verifyBearerToken(bearer(stayerPat))).not.toBeNull();
      expect((await mcpAction(mcpArgs(tools(stayerPat)))).status).toBe(200);
    });
  });

  it("refuses an OAuth access token and will not refresh it or redeem a pending code", async () => {
    await inRequest(async () => {
      const leaver = await seedAdmin("oauth-leaver");
      const stayer = await seedAdmin("oauth-stayer");
      const client = await registerDynamicClient({ clientName: "Agent", redirectUris: [REDIRECT] });
      const leaverTokens = await oauthTokensFor(leaver.id, client.clientId);
      const stayerTokens = await oauthTokensFor(stayer.id, client.clientId);
      const pendingCode = await issueAuthorizationCode({
        clientId: client.clientId,
        adminUserId: leaver.id,
        redirectUri: REDIRECT,
        scope: "mcp:read",
        codeChallenge: await createCodeChallenge(VERIFIER),
        codeChallengeMethod: "S256",
      });
      expect(await verifyBearerToken(bearer(leaverTokens.accessToken))).not.toBeNull();

      await new AdminUserRepo().setStatus(leaver.id, "disabled", Date.now());

      expect(await verifyBearerToken(bearer(leaverTokens.accessToken))).toBeNull();
      expect(await exchangeOAuthToken({ grantType: "refresh_token", clientId: client.clientId, refreshToken: leaverTokens.refreshToken }))
        .toMatchObject({ ok: false, error: "invalid_grant" });
      expect(await exchangeOAuthToken({ grantType: "authorization_code", clientId: client.clientId, code: pendingCode, codeVerifier: VERIFIER, redirectUri: REDIRECT }))
        .toMatchObject({ ok: false, error: "invalid_grant" });

      expect(await verifyBearerToken(bearer(stayerTokens.accessToken))).not.toBeNull();
      expect(await exchangeOAuthToken({ grantType: "refresh_token", clientId: client.clientId, refreshToken: stayerTokens.refreshToken })).toMatchObject({ ok: true });
    });
  });

  it("revokes every token and unredeemed code of the person when they are disabled, and nobody else's", async () => {
    await inRequest(async () => {
      const owner = await seedAdmin("disabler");
      const leaver = await seedAdmin("revoked-leaver");
      const stayer = await seedAdmin("revoked-stayer");
      const client = await registerDynamicClient({ clientName: "Agent", redirectUris: [REDIRECT] });
      const leaverPat = await patFor(leaver);
      const stayerPat = await patFor(stayer);
      const leaverOauth = await oauthTokensFor(leaver.id, client.clientId);
      const pending = await issueAuthorizationCode({
        clientId: client.clientId,
        adminUserId: leaver.id,
        redirectUri: REDIRECT,
        scope: "mcp:read",
        codeChallenge: await createCodeChallenge(VERIFIER),
        codeChallengeMethod: "S256",
      });

      expect(await setAdminStatus({ actorId: owner.id, targetId: leaver.id, status: "disabled" }, deps())).toMatchObject({ ok: true });

      const tokens = new McpTokenRepo();
      const leaversRows = await tokens.listTokensForAdmin(leaver.id);
      expect(leaversRows).toHaveLength(3);
      expect(leaversRows.every((row) => row.revokedAt !== null)).toBe(true);
      expect((await new McpOAuthRepo().findAuthCodeByHash(await sha256(pending)))?.usedAt).not.toBeNull();
      const stayersRows = await tokens.listTokensForAdmin(stayer.id);
      expect(stayersRows).toHaveLength(1);
      expect(stayersRows[0]?.revokedAt).toBeNull();
      expect(await verifyBearerToken(bearer(stayerPat))).not.toBeNull();

      // Re-enabling restores the sign-in only: the revoked grants stay revoked and the person mints new ones.
      await setAdminStatus({ actorId: owner.id, targetId: leaver.id, status: "active" }, deps());
      expect(await verifyBearerToken(bearer(leaverPat))).toBeNull();
      expect(await verifyBearerToken(bearer(leaverOauth.accessToken))).toBeNull();
      expect(await exchangeOAuthToken({ grantType: "refresh_token", clientId: client.clientId, refreshToken: leaverOauth.refreshToken }))
        .toMatchObject({ ok: false, error: "invalid_grant" });
    });
  });

  it("revokes a person's grants before deleting them, and leaves the others' alone", async () => {
    await inRequest(async () => {
      const owner = await seedAdmin("remover");
      const leaver = await seedAdmin("removed");
      const stayer = await seedAdmin("kept");
      const leaverPat = await patFor(leaver);
      const stayerPat = await patFor(stayer);

      expect(await removeAdmin({ actorId: owner.id, targetId: leaver.id }, deps())).toMatchObject({ ok: true });

      expect(await verifyBearerToken(bearer(leaverPat))).toBeNull();
      expect(await verifyBearerToken(bearer(stayerPat))).not.toBeNull();
    });
  });

  it("refuses a token that has no owning account", async () => {
    await inRequest(async () => {
      const orphan = await new McpTokenRepo().createToken({
        id: "pat_orphan",
        type: "pat",
        tokenHash: await sha256("mcp_pat_orphan-token"),
        tokenPrefix: "mcp_pat_orp",
        adminUserId: null,
        label: "orphan",
        scopes: ["mcp:read"],
        createdAt: Date.now(),
      });
      expect(orphan.adminUserId).toBeNull();
      expect(await verifyBearerToken(bearer("mcp_pat_orphan-token"))).toBeNull();
    });
  });
});
