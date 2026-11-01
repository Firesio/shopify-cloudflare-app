import { MEMBER_SEATS_KEY, seatLimitFrom, type SeatCheck } from "~/domain/member-seats";
import type { MemberSeats } from "~/ports/member-seats";

/**
 * The seat limit, read from the entitlement catalogue's `members.max`. `check` is the entitlement service's own; it reads
 * the plan and never writes, so asking on every page that needs it costs one memoised read.
 */
export function createMemberSeats(entitlements: { readonly check: (shop: string, key: typeof MEMBER_SEATS_KEY) => Promise<SeatCheck> }): MemberSeats {
  return { limit: async (shop) => seatLimitFrom(await entitlements.check(shop, MEMBER_SEATS_KEY)) };
}
