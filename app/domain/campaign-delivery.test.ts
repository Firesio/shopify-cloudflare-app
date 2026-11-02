import { describe, expect, it } from "vitest";
import { EMPTY_COUNTS, EMPTY_TALLY, MAX_RECIPIENT_ATTEMPTS, isPauseReason, judgePage, percentDone, settlementOf, PAUSE_REASONS } from "./campaign-delivery";

describe("judgePage", () => {
  it("keeps going when everything was sent", () => {
    expect(judgePage({ ...EMPTY_TALLY, sent: 25 })).toEqual({ next: "continue" });
  });

  it("keeps going through a few permanent failures: bad addresses are normal", () => {
    expect(judgePage({ ...EMPTY_TALLY, sent: 15, failed: 4, refused: 2, skipped: 3 })).toEqual({ next: "continue" });
  });

  it("stops when no mail channel is set up, however little was attempted", () => {
    expect(judgePage({ ...EMPTY_TALLY, unavailable: 1 })).toEqual({ next: "pause", reason: "channel_unavailable" });
  });

  it("stops when half or more of a real sample failed for good", () => {
    expect(judgePage({ ...EMPTY_TALLY, sent: 5, failed: 5 })).toEqual({ next: "pause", reason: "high_failure_rate" });
    expect(judgePage({ ...EMPTY_TALLY, sent: 0, failed: 25 })).toEqual({ next: "pause", reason: "high_failure_rate" });
  });

  it("does not read a failure rate into fewer than ten sends", () => {
    expect(judgePage({ ...EMPTY_TALLY, sent: 0, failed: 9 })).toEqual({ next: "continue" });
    expect(judgePage({ ...EMPTY_TALLY, sent: 6, failed: 3 })).toEqual({ next: "continue" });
  });

  it("is just under the limit at 4 of 10 and over it at 5 of 10", () => {
    expect(judgePage({ ...EMPTY_TALLY, sent: 6, failed: 4 })).toEqual({ next: "continue" });
    expect(judgePage({ ...EMPTY_TALLY, sent: 5, failed: 5 })).toMatchObject({ next: "pause" });
  });

  it("slows down on a transient error rather than stopping", () => {
    expect(judgePage({ ...EMPTY_TALLY, sent: 20, transient: 5 })).toEqual({ next: "back_off" });
  });

  it("puts a stop ahead of a slow-down", () => {
    expect(judgePage({ ...EMPTY_TALLY, failed: 12, sent: 2, transient: 3 })).toMatchObject({ next: "pause" });
    expect(judgePage({ ...EMPTY_TALLY, unavailable: 2, transient: 3 })).toMatchObject({ next: "pause" });
  });

  it("continues on an empty page", () => {
    expect(judgePage(EMPTY_TALLY)).toEqual({ next: "continue" });
  });
});

describe("pause reasons", () => {
  it("recognises exactly the declared ones", () => {
    for (const reason of PAUSE_REASONS) expect(isPauseReason(reason)).toBe(true);
    expect(isPauseReason("other")).toBe(false);
    expect(isPauseReason("")).toBe(false);
  });
});

describe("percentDone", () => {
  it("is zero for no recipients and while all are waiting", () => {
    expect(percentDone(EMPTY_COUNTS)).toBe(0);
    expect(percentDone({ ...EMPTY_COUNTS, pending: 40 })).toBe(0);
  });

  it("counts every recipient no longer waiting, whatever happened to it", () => {
    expect(percentDone({ pending: 50, sent: 30, failed: 10, refused: 5, skipped: 5 })).toBe(50);
  });

  it("rounds down so 100 means nobody is waiting", () => {
    expect(percentDone({ pending: 1, sent: 999, failed: 0, refused: 0, skipped: 0 })).toBe(99);
    expect(percentDone({ pending: 0, sent: 3, failed: 0, refused: 0, skipped: 0 })).toBe(100);
  });
});

describe("settlementOf", () => {
  it("records a sent mail", () => {
    expect(settlementOf({ kind: "sent" }, 0)).toEqual({ action: "settle", status: "sent", reasonCode: null, counts: "sent" });
  });

  it("records a rejection as a failure with its reason", () => {
    expect(settlementOf({ kind: "rejected", reason: "rejected" }, 0)).toEqual({ action: "settle", status: "failed", reasonCode: "rejected", counts: "failed" });
  });

  it("records a refusal with its reason, apart from failures", () => {
    expect(settlementOf({ kind: "refused", reason: "recipient_opted_out" }, 0)).toEqual({
      action: "settle",
      status: "refused",
      reasonCode: "recipient_opted_out",
      counts: "refused",
    });
  });

  it("holds the recipient, and counts no attempt, when the channel is not set up", () => {
    expect(settlementOf({ kind: "unavailable" }, 0)).toEqual({ action: "hold", counts: "unavailable" });
    expect(settlementOf({ kind: "unavailable" }, 99)).toEqual({ action: "hold", counts: "unavailable" });
  });

  it("retries a transient error until the attempts run out, then gives up as a failure", () => {
    for (let attempts = 0; attempts < MAX_RECIPIENT_ATTEMPTS - 1; attempts += 1) {
      expect(settlementOf({ kind: "transient" }, attempts)).toEqual({ action: "retry", counts: "transient" });
    }
    expect(settlementOf({ kind: "transient" }, MAX_RECIPIENT_ATTEMPTS - 1)).toEqual({
      action: "settle",
      status: "failed",
      reasonCode: "transport_error",
      counts: "failed",
    });
  });
});
