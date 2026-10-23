import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { ShopRepo } from "./shops.server";

setupTestDatabase();

describe("ShopRepo.getMany", () => {
  it("returns the rows of the shops asked for, once each, and nothing for an unknown shop", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new ShopRepo();
      await repo.recordInstall("a.myshopify.com", 1);
      await repo.recordInstall("b.myshopify.com", 2);
      await repo.recordInstall("other.myshopify.com", 3);
      const found = await repo.getMany(["a.myshopify.com", "b.myshopify.com", "a.myshopify.com", "unknown.myshopify.com"]);
      expect([...found.keys()].sort()).toEqual(["a.myshopify.com", "b.myshopify.com"]);
      expect(found.get("b.myshopify.com")?.installedAt).toBe(2);
    });
  });

  it("reads more shops than one statement can bind", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new ShopRepo();
      const domains = Array.from({ length: 205 }, (_, index) => `bulk-${index}.myshopify.com`);
      await repo.recordInstall(domains[3] ?? "", 1);
      await repo.recordInstall(domains[203] ?? "", 1);
      expect([...(await repo.getMany(domains)).keys()].sort()).toEqual([domains[3], domains[203]].sort());
    });
  });

  it("is empty for no shops", async () => {
    await runWithRequestContext(env, async () => {
      expect((await new ShopRepo().getMany([])).size).toBe(0);
    });
  });
});
