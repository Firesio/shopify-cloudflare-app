import type { SeatLimit } from "~/domain/member-seats";
import type { MemberSeats } from "~/ports/member-seats";

/** A plan with a fixed seat limit that counts how often it is asked, so a test can say it was only asked when needed. */
export function fakeSeats(limit: SeatLimit = { kind: "unlimited" }): MemberSeats & { asked: number } {
  const seats = {
    asked: 0,
    async limit() {
      seats.asked += 1;
      return limit;
    },
  };
  return seats;
}

export const noSeats: SeatLimit = { kind: "limit", maximum: 0 };
export const seatsFor = (maximum: number): SeatLimit => ({ kind: "limit", maximum });
