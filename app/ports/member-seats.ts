import type { OverageLimit, SeatLimit } from "~/domain/member-seats";

/** What the use cases ask of the plan: how many active members this shop may have. Implemented over the entitlement service. */
export interface MemberSeats {
  /** The limit for letting someone IN: a refusal means no new seats, never more than that. */
  limit(shop: string): Promise<SeatLimit>;
  /**
   * The limit for taking a seat AWAY, read strictly and fresh (`overageLimitFrom`): never from a cache, and every
   * refusal or unreadable answer is `unknown`, never a limit of zero. Asked only by the seat-overage review.
   */
  overageLimit(shop: string): Promise<OverageLimit>;
}
