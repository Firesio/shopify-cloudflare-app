import type { OverageLimit, SeatLimit, SeatReading } from "~/domain/member-seats";
import type { MemberSeats } from "~/ports/member-seats";

/** A plan with a fixed seat limit that counts how often it is asked, so a test can say it was only asked when needed. */
export function fakeSeats(limit: SeatLimit = { kind: "unlimited" }, reading: SeatReading = limit): MemberSeats & { asked: number; readings: number } {
  const seats = {
    asked: 0,
    readings: 0,
    async limit() {
      seats.asked += 1;
      return limit;
    },
    // What the page may say; by default the limit itself, a test of an unreadable plan passes `{ kind: "unknown" }`.
    async reading(): Promise<SeatReading> {
      seats.readings += 1;
      return reading;
    },
    // A fake plan that limits seats is a strict limit too; unlimited is unlimited. A test that needs an unreadable one passes its own.
    async overageLimit(): Promise<OverageLimit> {
      return limit.kind === "unlimited" ? { kind: "unlimited" } : { kind: "limit", maximum: limit.maximum };
    },
  };
  return seats;
}

export const noSeats: SeatLimit = { kind: "limit", maximum: 0 };
export const seatsFor = (maximum: number): SeatLimit => ({ kind: "limit", maximum });
