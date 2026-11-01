import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS, MEMBER_ROLES, can, type MemberPermission } from "~/domain/member-access";
import type { Member } from "~/ports/members";
import { runWithRequestContext } from "~/request-context.server";
import type { AuthenticatedRequest, MemberAccess, MemberIdentity } from "~/services/members.server";
import { accessRefusalOf, requireMember, type MemberGuardDependencies } from "./require-member.server";

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const SHOP = "alpha.myshopify.com";
const member = (role: Member["role"]): Member => ({
  id: "m1", shop: SHOP, shopifyUserId: "42", email: null, name: null, role, status: "active",
  accountOwner: false, collaborator: false, invitedBy: null, createdAt: 1, updatedAt: 1, lastSeenAt: 1,
});

interface Harness {
  readonly deps: MemberGuardDependencies<AuthenticatedRequest & { admin: string }>;
  readonly resolved: MemberIdentity[];
  readonly mismatches: string[];
}

function harness(access: MemberAccess, auth: AuthenticatedRequest & { admin: string } = { admin: "client", session: { shop: SHOP }, sessionToken: { sub: "42" } }): Harness {
  const resolved: MemberIdentity[] = [];
  const mismatches: string[] = [];
  return {
    resolved,
    mismatches,
    deps: {
      authenticate: async () => auth,
      resolve: async (identity) => {
        resolved.push(identity);
        return access;
      },
      onUserIdMismatch: (shop) => void mismatches.push(shop),
    },
  };
}

const request = new Request("https://app.test/app");

async function thrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the guard to refuse");
}

/** A thrown `data(...)` carries its status in `init` and its body in `data`. */
const refusal = (error: unknown): { status: number | undefined; reason: unknown; shop: unknown } => {
  const shaped = error as { init?: { status?: number }; data?: { reason?: unknown; shop?: unknown } };
  return { status: shaped.init?.status, reason: shaped.data?.reason, shop: shaped.data?.shop };
};

describe("requireMember", () => {
  it("returns everything the authentication returned, plus the member", async () => {
    const { deps } = harness({ ok: true, member: member("member") });
    const result = await inRequest(() => requireMember(request, "app:manage", deps));
    expect(result).toMatchObject({ admin: "client", session: { shop: SHOP }, member: { id: "m1", role: "member" } });
  });

  it.each(MEMBER_ROLES.flatMap((role) => MEMBER_PERMISSIONS.map((permission) => [role, permission] as const)))(
    "gives %s the permission %s exactly when the role holds it",
    async (role, permission: MemberPermission) => {
      const { deps } = harness({ ok: true, member: member(role) });
      const outcome = await inRequest(() => requireMember(request, permission, deps).then(() => "allowed" as const, (error: unknown) => refusal(error)));
      expect(outcome).toEqual(can(role, permission) ? "allowed" : { status: 403, reason: "forbidden", shop: SHOP });
    },
  );

  it.each(["pending", "removed", "not_invited"] as const)("refuses someone kept out for %s with that reason, as a 403", async (reason) => {
    const { deps } = harness({ ok: false, reason });
    expect(refusal(await inRequest(() => thrown(() => requireMember(request, "app:view", deps))))).toEqual({ status: 403, reason, shop: SHOP });
  });

  it("asks for the person Shopify proved, in the shop Shopify proved", async () => {
    const { deps, resolved } = harness({ ok: true, member: member("owner") });
    await inRequest(() => requireMember(request, "app:view", deps));
    expect(resolved).toEqual([{ shop: SHOP, shopifyUserId: "42", email: null, name: null, accountOwner: false, collaborator: false }]);
  });

  it("asks once for the layout and its page in the same request", async () => {
    const { deps, resolved } = harness({ ok: true, member: member("owner") });
    await inRequest(async () => {
      await requireMember(request, "app:view", deps);
      await requireMember(request, "billing:manage", deps);
    });
    expect(resolved).toHaveLength(1);
  });

  it("asks again for another person in the same request context", async () => {
    const { deps, resolved } = harness({ ok: true, member: member("owner") });
    await inRequest(async () => {
      await requireMember(request, "app:view", deps);
      await requireMember(request, "app:view", { ...deps, authenticate: async () => ({ admin: "client", session: { shop: SHOP }, sessionToken: { sub: "43" } }) });
    });
    expect(resolved.map((identity) => identity.shopifyUserId)).toEqual(["42", "43"]);
  });

  it("asks again for the same user id in another shop", async () => {
    const { deps, resolved } = harness({ ok: true, member: member("owner") });
    await inRequest(async () => {
      await requireMember(request, "app:view", deps);
      await requireMember(request, "app:view", { ...deps, authenticate: async () => ({ admin: "client", session: { shop: "beta.myshopify.com" }, sessionToken: { sub: "42" } }) });
    });
    expect(resolved.map((identity) => identity.shop)).toEqual([SHOP, "beta.myshopify.com"]);
  });

  it("answers 401 with the retry header, and asks nobody, when the token names no user", async () => {
    const { deps, resolved } = harness({ ok: true, member: member("owner") }, { admin: "client", session: { shop: SHOP }, sessionToken: {} });
    const error = await inRequest(() => thrown(() => requireMember(request, "app:view", deps)));
    expect(error).toBeInstanceOf(Response);
    expect(error instanceof Response && error.status).toBe(401);
    expect(error instanceof Response && error.headers.get("X-Shopify-Retry-Invalid-Session-Request")).toBe("1");
    expect(resolved).toEqual([]);
  });

  it("lets the library's own response through untouched, and asks nobody, when authentication fails", async () => {
    const bounce = new Response(null, { status: 302 });
    const resolved: MemberIdentity[] = [];
    const error = await inRequest(() =>
      thrown(() =>
        requireMember<AuthenticatedRequest>(request, "app:view", {
          authenticate: async () => {
            throw bounce;
          },
          resolve: async (identity) => {
            resolved.push(identity);
            return { ok: true, member: member("owner") };
          },
          onUserIdMismatch: () => undefined,
        }),
      ),
    );
    expect(error).toBe(bounce);
    expect(resolved).toEqual([]);
  });

  it("reports an ID token and an online profile that name different users, and still goes on", async () => {
    const auth = { admin: "client", session: { shop: SHOP, onlineAccessInfo: { associated_user: { id: 7 } } }, sessionToken: { sub: "42" } };
    const { deps, mismatches } = harness({ ok: true, member: member("owner") }, auth);
    await inRequest(() => requireMember(request, "app:view", deps));
    expect(mismatches).toEqual([SHOP]);
  });

  it("stays quiet when they agree", async () => {
    const auth = { admin: "client", session: { shop: SHOP, onlineAccessInfo: { associated_user: { id: 42 } } }, sessionToken: { sub: "42" } };
    const { deps, mismatches } = harness({ ok: true, member: member("owner") }, auth);
    await inRequest(() => requireMember(request, "app:view", deps));
    expect(mismatches).toEqual([]);
  });
});

describe("accessRefusalOf", () => {
  it("names the reason of a refusal the guard threw", async () => {
    for (const reason of ["pending", "removed", "not_invited", "forbidden"] as const) {
      const { deps } = harness(reason === "forbidden" ? { ok: true, member: member("viewer") } : { ok: false, reason });
      const error = await inRequest(() => thrown(() => requireMember(request, "billing:manage", deps)));
      expect(accessRefusalOf(error)).toEqual({ reason, shop: SHOP });
    }
  });

  it.each([
    ["a library redirect", new Response(null, { status: 302 })],
    ["a 403 Response", new Response("no", { status: 403 })],
    ["an Error", new Error("boom")],
    ["null", null],
    ["a string", "forbidden"],
    ["a 403 with some other reason", { data: { reason: "banned" }, init: { status: 403 } }],
    ["the right reason with another status", { data: { reason: "pending" }, init: { status: 500 } }],
    ["a body that is not an object", { data: "pending", init: { status: 403 } }],
    ["a refusal that names no shop", { data: { reason: "pending" }, init: { status: 403 } }],
    ["a refusal whose shop is blank", { data: { reason: "pending", shop: "" }, init: { status: 403 } }],
  ])("is undefined for %s", (_name, value) => {
    expect(accessRefusalOf(value)).toBeUndefined();
  });
});
