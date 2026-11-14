import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { d1Preferences } from "./d1-preferences";

setupTestDatabase();

describe("notification preferences", () => {
  const store = () => d1Preferences(env.DB, () => 1);

  it("starts empty (every type keeps its default) and saves a choice per shop", async () => {
    expect(await store().load("pref-one.myshopify.com")).toEqual({});
    await store().save("pref-one.myshopify.com", [{ type: "support.staff_reply", channel: "email", on: false }]);
    expect(await store().load("pref-one.myshopify.com")).toEqual({ "support.staff_reply": { email: false } });
    expect(await store().load("pref-two.myshopify.com")).toEqual({});
  });

  it("changes a choice in place", async () => {
    await store().save("pref-one.myshopify.com", [{ type: "t", channel: "email", on: false }]);
    await store().save("pref-one.myshopify.com", [{ type: "t", channel: "email", on: true }]);
    expect(await store().load("pref-one.myshopify.com")).toEqual({ t: { email: true } });
  });
});
