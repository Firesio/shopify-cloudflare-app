import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS } from "~/domain/member-access";
import { AccessProvider, makeAccess, useAccess } from "./access";

function Probe() {
  const { can } = useAccess();
  return <p>{MEMBER_PERMISSIONS.map((permission) => `${permission}=${String(can(permission))}`).join(",")}</p>;
}

describe("asking what the person may do", () => {
  it("is yes for each permission they hold and no for every other", () => {
    const access = makeAccess(["app:view", "billing:manage"]);
    expect(MEMBER_PERMISSIONS.map((permission) => access.can(permission))).toEqual([true, false, true, false]);
  });

  it("is no to everything for someone who holds nothing", () => {
    const access = makeAccess([]);
    expect(MEMBER_PERMISSIONS.some((permission) => access.can(permission))).toBe(false);
  });

  it("is no to everything where nothing said who is asking: a page outside the provider offers nothing", () => {
    expect(renderToString(<Probe />)).toContain("app:view=false,app:manage=false,billing:manage=false,members:manage=false");
  });

  it("is read by any page under the provider, from the permissions the layout gave", () => {
    const html = renderToString(
      <AccessProvider permissions={["app:view", "app:manage"]}>
        <Probe />
      </AccessProvider>,
    );
    expect(html).toContain("app:view=true,app:manage=true,billing:manage=false,members:manage=false");
  });
});
