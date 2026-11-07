import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { customPolicy } from "~/domain/member-permissions";
import { MEMBERS } from "~/members/config";
import { runWithRequestContext } from "~/request-context.server";
import { memberDependencies } from "./members.server";

describe("what the member use cases run on", () => {
  it("carries the app's choice about permissions of a member's own, from the one configuration", async () => {
    const deps = await runWithRequestContext(env, async () => memberDependencies());
    expect(deps.customPermissions).toEqual(customPolicy(MEMBERS.customPermissions));
    // The shipped template does not let merchants choose, and what only comes with a role is protected either way.
    expect(deps.customPermissions.enabled).toBe(false);
    expect(deps.customPermissions.protected).toContain("members:manage");
  });
});
