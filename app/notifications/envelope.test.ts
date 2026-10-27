import { describe, expect, it } from "vitest";
import { parseEnvelope, toEnvelope, type QueuedNotification } from "./envelope";

const reset: QueuedNotification = {
  event: "admin_password_reset",
  to: { email: "ops@workmanjsc.vn" },
  dedupeKey: "admin_password_reset:abc",
  logId: "log-1",
  payload: { recipientName: "Ops", resetUrl: "https://app.workmanjsc.vn/r/t", expiresIn: "one hour" },
};

const onTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("notification envelope", () => {
  it("round-trips a request through JSON", () => {
    const parsed = parseEnvelope(onTheWire(toEnvelope(reset)));
    expect(parsed).toEqual({ ok: true, value: reset });
  });

  it("round-trips optional scope and copies", () => {
    const withCopies: QueuedNotification = {
      event: "support_staff_reply",
      to: { email: "merchant@workmanjsc.vn" },
      cc: { email: ["boss@workmanjsc.vn"] },
      scope: "shop.myshopify.com",
      dedupeKey: "k",
      payload: { recipientName: "M", subject: "s", excerpt: "e", threadUrl: "https://x/y", staffName: "Sam", ticketId: "t" },
    };
    expect(parseEnvelope(onTheWire(toEnvelope(withCopies)))).toEqual({ ok: true, value: withCopies });
  });

  it("covers every event with a payload schema", () => {
    const merchantActivity: QueuedNotification = {
      event: "support_merchant_activity",
      to: { email: "staff@workmanjsc.vn" },
      dedupeKey: "k",
      payload: { recipientName: "S", subject: "s", excerpt: "e", threadUrl: "https://x/y", shopName: "Shop", isNew: true },
    };
    expect(parseEnvelope(onTheWire(toEnvelope(merchantActivity))).ok).toBe(true);
  });

  it("rejects an unknown event by name", () => {
    expect(parseEnvelope({ ...toEnvelope(reset), event: "retired_event" })).toMatchObject({ ok: false, reason: "unknown_event" });
  });

  it("rejects a payload that does not match its event", () => {
    expect(parseEnvelope({ ...toEnvelope(reset), payload: { recipientName: "Ops" } })).toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  it("rejects a body with no dedupe key", () => {
    expect(parseEnvelope({ ...toEnvelope(reset), dedupeKey: undefined })).toMatchObject({ ok: false, reason: "malformed" });
  });

  it.each([null, undefined, "text", 42, [], {}])("rejects %j as malformed", (body) => {
    expect(parseEnvelope(body)).toMatchObject({ ok: false });
  });

  it("drops fields the schema does not know instead of passing them on", () => {
    const parsed = parseEnvelope({ ...toEnvelope(reset), payload: { ...reset.payload, extra: "x" } });
    expect(parsed.ok && "extra" in parsed.value.payload).toBe(false);
  });

  it("round-trips a push request, which names a device by id", () => {
    const push: QueuedNotification = {
      event: "shop_installed",
      to: { push: "subscription-id-1" },
      scope: "alpha.myshopify.com",
      dedupeKey: "shop-installed:alpha.myshopify.com:new",
      payload: {
        recipientName: "Staff",
        shopName: "Alpha Store",
        shop: "alpha.myshopify.com",
        occurredAt: "Oct 15, 2026, 9:30 AM",
        adminUrl: "https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com",
      },
    };
    expect(parseEnvelope(onTheWire(toEnvelope(push)))).toEqual({ ok: true, value: push });
  });

  it("covers the test event, whose payload is only the base fields", () => {
    const test: QueuedNotification = { event: "push_test", to: { push: "d1" }, dedupeKey: "push-test:1", payload: { recipientName: "Staff" } };
    expect(parseEnvelope(onTheWire(toEnvelope(test)))).toEqual({ ok: true, value: test });
  });

  it("rejects a shop notification missing the shop", () => {
    const body = { v: 1, event: "shop_uninstalled", to: { push: "d1" }, dedupeKey: "k", payload: { recipientName: "S", shopName: "A", occurredAt: "x", adminUrl: "y" } };
    expect(parseEnvelope(body)).toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  // The recipient's language is parsed at the queue's edge into a canonical tag, so nothing inward sees `es_mx`.
  it("parses the payload's language into a canonical tag and refuses one that is not a tag", () => {
    const body = (language: unknown) => ({ v: 1, event: "push_test", to: { push: "d1" }, dedupeKey: "k", payload: { recipientName: "S", language } });
    const parsed = parseEnvelope(body("es_mx"));
    expect(parsed).toMatchObject({ ok: true, value: { payload: { language: "es-MX" } } });
    expect(parseEnvelope(body("not a tag!"))).toMatchObject({ ok: false, reason: "invalid_payload" });
    expect(parseEnvelope(body(7))).toMatchObject({ ok: false, reason: "invalid_payload" });
    expect(parseEnvelope(body(undefined))).toMatchObject({ ok: true });
  });

  // One release of grace: a message queued before `locale` was renamed `language` keeps its language.
  it("accepts the old `locale` field as the language, and prefers `language` when both are there", () => {
    const body = (extra: Record<string, unknown>) => ({ v: 1, event: "push_test", to: { push: "d1" }, dedupeKey: "k", payload: { recipientName: "S", ...extra } });
    expect(parseEnvelope(body({ locale: "es_MX" }))).toMatchObject({ ok: true, value: { payload: { language: "es-MX" } } });
    expect(parseEnvelope(body({ locale: "es", language: "en" }))).toMatchObject({ ok: true, value: { payload: { language: "en" } } });
    expect(parseEnvelope(body({ locale: "not a tag!" }))).toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  it("parses a staff reply queued before it carried the ticket id", () => {
    const body = { v: 1, event: "support_staff_reply", to: { email: "m@x.co" }, dedupeKey: "k", payload: { recipientName: "M", subject: "s", excerpt: "e", threadUrl: "https://x/y", staffName: "Sam" } };
    expect(parseEnvelope(body)).toMatchObject({ ok: true, value: { payload: { ticketId: "" } } });
  });
});
