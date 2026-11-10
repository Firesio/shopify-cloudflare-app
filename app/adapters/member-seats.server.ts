import { MEMBER_SEATS_KEY, overageLimitFrom, seatLimitFrom, seatReadingFrom, type SeatCheck } from "~/domain/member-seats";
import type { MemberSeats } from "~/ports/member-seats";

/**
 * The seat limit, read from the entitlement catalogue's `members.max`. `check` is the entitlement service's own; it reads
 * the plan and never writes, so asking on every page that needs it costs one memoised read.
 *
 * `forget` drops whatever that read memoised for the shop in this request. Letting someone in may use a snapshot read a
 * moment ago; taking a seat away must not, so `overageLimit` calls it first.
 */
export function createMemberSeats(
  entitlements: { readonly check: (shop: string, key: typeof MEMBER_SEATS_KEY) => Promise<SeatCheck> },
  options: { readonly forget?: (shop: string) => void } = {},
): MemberSeats {
  return {
    limit: async (shop) => seatLimitFrom(await entitlements.check(shop, MEMBER_SEATS_KEY)),
    reading: async (shop) => seatReadingFrom(await entitlements.check(shop, MEMBER_SEATS_KEY)),
    overageLimit: async (shop) => {
      options.forget?.(shop);
      return overageLimitFrom(await entitlements.check(shop, MEMBER_SEATS_KEY));
    },
  };
}
