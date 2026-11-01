import { describe, expect, it } from "vitest";
import { FakeMemberStore } from "~/test/fake-members";
import { contactsToAsk } from "./contacts";

const SHOP = "alpha.myshopify.com";

describe("contactsToAsk", () => {
  it("names the shop's active owners and admins, owners first, and nobody else", async () => {
    const members = new FakeMemberStore();
    members.add({ id: "a", shop: SHOP, role: "admin", status: "active", name: "Zed", email: "z@firesio.app" });
    members.add({ id: "o", shop: SHOP, role: "owner", status: "active", name: "Bea", email: "b@firesio.app" });
    members.add({ id: "m", shop: SHOP, role: "member", status: "active", name: "Mia", email: "m@firesio.app" });
    members.add({ id: "p", shop: SHOP, role: "owner", status: "pending", name: "Pat", email: "p@firesio.app" });
    members.add({ id: "r", shop: SHOP, role: "admin", status: "removed", name: "Rex", email: "r@firesio.app" });
    expect(await contactsToAsk(SHOP, { members })).toEqual([
      { name: "Bea", email: "b@firesio.app" },
      { name: "Zed", email: "z@firesio.app" },
    ]);
  });

  it("never names another shop's people", async () => {
    const members = new FakeMemberStore();
    members.add({ id: "o", shop: "beta.myshopify.com", role: "owner", status: "active", name: "Other", email: "o@firesio.app" });
    expect(await contactsToAsk(SHOP, { members })).toEqual([]);
  });

  it("is empty for a shop with no one to ask", async () => {
    expect(await contactsToAsk(SHOP, { members: new FakeMemberStore() })).toEqual([]);
  });
});
