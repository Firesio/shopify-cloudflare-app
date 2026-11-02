import { describe, expect, it } from "vitest";
import { DEFAULT_AUDIENCE } from "~/domain/campaign-audience";
import { audienceFilterSchema, audienceFromForm, dayToInstant, instantToDay, parseStoredAudience } from "./campaign";

const form = (fields: Record<string, string>) => ({ get: (name: string) => fields[name] ?? null });

describe("parseStoredAudience", () => {
  it("reads what the model stores", () => {
    const stored = JSON.stringify({ kind: "all", installedAfter: 1_000, installedBefore: null });
    expect(parseStoredAudience(stored)).toEqual({ kind: "all", installedAfter: 1_000, installedBefore: null });
  });

  it("fills a field added after the row was written with its default", () => {
    expect(parseStoredAudience(JSON.stringify({ kind: "dev" }))).toEqual({ kind: "dev", installedAfter: null, installedBefore: null });
  });

  it("drops a field the code no longer has", () => {
    expect(parseStoredAudience(JSON.stringify({ kind: "real", plan: "pro" }))).toEqual(DEFAULT_AUDIENCE);
  });

  it.each(["", "not json", "null", "[]", '{"kind":"vip"}', '{"installedAfter":-1}', '{"installedAfter":1.5}'])(
    "falls back to the default for %j instead of throwing",
    (text) => {
      expect(parseStoredAudience(text)).toEqual(DEFAULT_AUDIENCE);
    },
  );

  it("is the same shape as the filter type", () => {
    expect(audienceFilterSchema.parse({})).toEqual(DEFAULT_AUDIENCE);
  });
});

describe("dates", () => {
  it("turns a day into the start of that day in UTC and back", () => {
    expect(dayToInstant("2026-01-15")).toBe(Date.UTC(2026, 0, 15));
    expect(instantToDay(Date.UTC(2026, 0, 15))).toBe("2026-01-15");
    expect(instantToDay(null)).toBe("");
  });

  it.each(["", "2026-02-31", "2026-13-01", "15/01/2026", "2026-1-5", "tomorrow", "2026-00-10"])("reads %j as no date", (value) => {
    expect(dayToInstant(value)).toBeNull();
  });

  it("accepts a leap day only in a leap year", () => {
    expect(dayToInstant("2028-02-29")).toBe(Date.UTC(2028, 1, 29));
    expect(dayToInstant("2027-02-29")).toBeNull();
  });
});

describe("audienceFromForm", () => {
  it("reads the three fields", () => {
    expect(audienceFromForm(form({ audienceKind: "all", installedAfter: "2026-01-01", installedBefore: "2026-06-30" }))).toEqual({
      kind: "all",
      installedAfter: Date.UTC(2026, 0, 1),
      installedBefore: Date.UTC(2026, 5, 30),
    });
  });

  it("falls back to the default kind for a forged value, and no bounds for blanks", () => {
    expect(audienceFromForm(form({ audienceKind: "everyone" }))).toEqual(DEFAULT_AUDIENCE);
    expect(audienceFromForm(form({}))).toEqual(DEFAULT_AUDIENCE);
  });
});
