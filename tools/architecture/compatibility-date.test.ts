import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPATIBILITY_DATE, COMPATIBILITY_DATE_MIN_BROWSER_RUN, COMPATIBILITY_DATE_NOT_BEFORE_TESTED } from "@firesio/app";
import { describe, expect, it } from "vitest";
import { stripJsonComments } from "../../scripts/wrangler-config.mjs";

/**
 * ONE `compatibility_date` for every Firesio Worker: `COMPATIBILITY_DATE` of `@firesio/app` (the portal's and the fake app's `wrangler.jsonc` say the same; the
 * platform's own test holds them). An app copies the constant into its `wrangler.jsonc` and holds it here. Raising it is its own change: run the full suite and the
 * production build on the new date first, then move the constant with a newer package. From 2026-11-17 the new module registry is the default and `request.signal`
 * aborts when the client leaves; the package keeps its shared date below the first date nobody has tested.
 */
const config: unknown = JSON.parse(stripJsonComments(readFileSync(join(import.meta.dirname, "../../wrangler.jsonc"), "utf8")));
const dateOf = (source: unknown): unknown => (typeof source === "object" && source !== null && "compatibility_date" in source ? source.compatibility_date : undefined);

describe("wrangler.jsonc's compatibility_date", () => {
  it("is the package's shared date, and is inherited by the production environment (a named environment declares none of its own)", () => {
    expect(dateOf(config)).toBe(COMPATIBILITY_DATE);
    const production = typeof config === "object" && config !== null && "env" in config && typeof config.env === "object" && config.env !== null && "production" in config.env ? config.env.production : undefined;
    expect(dateOf(production)).toBeUndefined();
  });

  it("is below the first untested date, and at or above the floor Browser Run's quickAction needs (the template uses neither, a derived app may)", () => {
    expect(COMPATIBILITY_DATE < COMPATIBILITY_DATE_NOT_BEFORE_TESTED).toBe(true);
    expect(COMPATIBILITY_DATE >= COMPATIBILITY_DATE_MIN_BROWSER_RUN).toBe(true);
  });
});
