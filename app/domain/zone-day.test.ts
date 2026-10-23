import { describe, expect, it } from "vitest";
import { dayInZone, isValidTimeZone, monthWindowInZone, startOfLocalDay } from "./zone-day";

const utc = (iso: string): number => Date.parse(iso);

describe("dayInZone", () => {
  it("names the calendar day in the zone, not in UTC", () => {
    const instant = utc("2026-03-31T20:00:00Z");
    expect(dayInZone(instant, "UTC")).toBe("2026-03-31");
    expect(dayInZone(instant, "Pacific/Auckland")).toBe("2026-04-01");
    expect(dayInZone(instant, "America/Los_Angeles")).toBe("2026-03-31");
  });
});

describe("startOfLocalDay", () => {
  it("is midnight in the zone", () => {
    expect(startOfLocalDay({ year: 2026, month: 3, day: 1 }, "UTC")).toBe(utc("2026-03-01T00:00:00Z"));
    expect(startOfLocalDay({ year: 2026, month: 3, day: 1 }, "Asia/Ho_Chi_Minh")).toBe(utc("2026-02-28T17:00:00Z"));
  });

  it("follows the zone's offset on that date, daylight saving included", () => {
    expect(startOfLocalDay({ year: 2026, month: 1, day: 1 }, "America/Los_Angeles")).toBe(utc("2026-01-01T08:00:00Z"));
    expect(startOfLocalDay({ year: 2026, month: 7, day: 1 }, "America/Los_Angeles")).toBe(utc("2026-07-01T07:00:00Z"));
  });

  it("refuses a date that does not exist instead of rolling forward", () => {
    expect(() => startOfLocalDay({ year: 2026, month: 2, day: 30 }, "UTC")).toThrow(RangeError);
    expect(() => startOfLocalDay({ year: 2026, month: 13, day: 1 }, "UTC")).toThrow(RangeError);
  });
});

describe("monthWindowInZone", () => {
  it("is the calendar month in UTC, keyed YYYY-MM, with an exclusive end", () => {
    expect(monthWindowInZone(utc("2026-03-15T12:00:00Z"), "UTC")).toEqual({
      key: "2026-03",
      start: utc("2026-03-01T00:00:00Z"),
      end: utc("2026-04-01T00:00:00Z"),
    });
  });

  it("is the month the zone's own calendar is in", () => {
    // 2026-03-31 20:00Z is already 1 April in Auckland (NZDT, UTC+13) and still 31 March in Los Angeles.
    const instant = utc("2026-03-31T20:00:00Z");
    expect(monthWindowInZone(instant, "Pacific/Auckland")).toEqual({
      key: "2026-04",
      start: utc("2026-03-31T11:00:00Z"),
      end: utc("2026-04-30T12:00:00Z"),
    });
    expect(monthWindowInZone(instant, "America/Los_Angeles")).toMatchObject({ key: "2026-03" });
  });

  it("switches at the zone's midnight and not a second earlier", () => {
    const midnight = utc("2026-03-31T11:00:00Z"); // 2026-04-01 00:00 in Auckland
    expect(monthWindowInZone(midnight - 1000, "Pacific/Auckland").key).toBe("2026-03");
    expect(monthWindowInZone(midnight, "Pacific/Auckland").key).toBe("2026-04");
    expect(monthWindowInZone(midnight - 1, "Pacific/Auckland").end).toBe(midnight);
  });

  it("rolls December into January of the next year", () => {
    expect(monthWindowInZone(utc("2026-12-31T23:30:00Z"), "UTC")).toMatchObject({ key: "2026-12", end: utc("2027-01-01T00:00:00Z") });
    expect(monthWindowInZone(utc("2026-12-31T23:30:00Z"), "Asia/Tokyo")).toMatchObject({ key: "2027-01", start: utc("2026-12-31T15:00:00Z") });
  });

  it.each([
    ["2026-02-10T00:00:00Z", 28],
    ["2028-02-10T00:00:00Z", 29],
    ["2026-04-10T00:00:00Z", 30],
    ["2026-01-10T00:00:00Z", 31],
  ])("is %s a month of %i days in UTC", (iso, days) => {
    const window = monthWindowInZone(utc(iso), "UTC");
    expect((window.end - window.start) / 86_400_000).toBe(days);
  });

  it("is one hour shorter or longer across a daylight saving change", () => {
    const march = monthWindowInZone(utc("2026-03-15T00:00:00Z"), "America/Los_Angeles");
    expect(march.start).toBe(utc("2026-03-01T08:00:00Z"));
    expect(march.end).toBe(utc("2026-04-01T07:00:00Z"));
    expect((march.end - march.start) / 3_600_000).toBe(31 * 24 - 1);
  });

  it("covers every instant of a year once: each month ends where the next begins", () => {
    let at = utc("2026-01-01T00:00:00Z");
    for (let month = 0; month < 12; month += 1) {
      const window = monthWindowInZone(at, "America/Los_Angeles");
      expect(monthWindowInZone(window.start, "America/Los_Angeles").key).toBe(window.key);
      expect(monthWindowInZone(window.end - 1, "America/Los_Angeles").key).toBe(window.key);
      expect(monthWindowInZone(window.end, "America/Los_Angeles").start).toBe(window.end);
      at = window.end;
    }
  });
});

describe("isValidTimeZone", () => {
  it("accepts an IANA zone and refuses anything else", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
