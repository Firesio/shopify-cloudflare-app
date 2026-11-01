import type { SeatLimit } from "~/domain/member-seats";

/** What the use cases ask of the plan: how many active members this shop may have. Implemented over the entitlement service. */
export interface MemberSeats {
  limit(shop: string): Promise<SeatLimit>;
}
