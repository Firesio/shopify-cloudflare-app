import { createMemberSeats } from "~/adapters/member-seats.server";
import { MemberRepo } from "~/models/members.server";
import { MEMBERS } from "~/members/config";
import { shopLog } from "~/observability/shop-log";
import type { MemberSeats } from "~/ports/member-seats";
import type { MemberStore } from "~/ports/members";
import type { ManageDependencies, MemberDependencies } from "~/services/members.server";
import { entitlements } from "~/wiring/billing.server";
import { appRuntime } from "~/wiring/runtime.server";

/** The shop's members, behind their port. */
export function memberStore(): MemberStore {
  return new MemberRepo();
}

/** The plan's seat limit: the entitlement catalogue's `members.max`. Swap this one function to take seats from somewhere else. */
export function memberSeats(): MemberSeats {
  return createMemberSeats(entitlements());
}

/**
 * What the member use cases run on: the D1 store, the plan's seats, the app's own choices (`app/members/config.ts`), the
 * runtime, and a log that names a shop by its hash and carries no address or name.
 */
export function memberDependencies(): MemberDependencies & ManageDependencies {
  return {
    members: memberStore(),
    seats: memberSeats(),
    config: MEMBERS,
    runtime: appRuntime(),
    log: ({ event, shop, ...fields }) => shopLog(event, shop, fields),
  };
}
