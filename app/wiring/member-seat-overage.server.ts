import { createMemberSeats } from "~/adapters/member-seats.server";
import { isOperationalRelationshipStatus } from "~/domain/shop-lifecycle";
import { SEAT_SCAN_CHECKPOINT, type SeatOverageConfig } from "~/domain/member-seat-overage";
import { MEMBERS } from "~/members/config";
import { MemberSeatEpisodeRepo } from "~/models/member-seat-episodes.server";
import { shopLog } from "~/observability/shop-log";
import type { MemberPrivilege, SeatScanCursor, SeatShops } from "~/ports/member-seat-overage";
import { forgetRequestMemo, getEnv, runAfterResponse } from "~/request-context.server";
import { reviewSeatOverage, type SeatOverageDependencies } from "~/services/members/review-seat-overage";
import { sweepSeatOverage, type SeatSweepDependencies } from "~/services/members/sweep-seat-overage";
import { absolute, paths } from "~/urls";
import { entitlements } from "~/wiring/billing.server";
import { invalidateEntitlements, subscriptionMemoKey } from "~/wiring/entitlement-cache.server";
import { memberStore } from "~/wiring/members.server";
import { handoffNotifier } from "~/wiring/notifications.server";
import { shops, shopSyncCheckpoints } from "~/wiring/repositories.server";
import { appRuntime } from "~/wiring/runtime.server";

/**
 * The app's own privilege scores for its members, so that people who can do less lose a seat first. NONE by default: the
 * template knows nothing about what a member does beyond their role, and an app that does supplies a `MemberPrivilege`
 * here (one function, read by the seat-overage review only). Without it the order is by role rank alone.
 */
function memberPrivilege(): MemberPrivilege | undefined {
  return undefined;
}

const nonEmpty = (value: string | null): string | null => (value === null || value.trim() === "" ? null : value);

/** The shop as the review needs it. A shop with no row, or one that is not installed, is not installed. */
function seatShops(): SeatShops {
  return {
    facts: async (shop) => {
      const row = await shops().get(shop);
      if (row === undefined) return undefined;
      return { installed: isOperationalRelationshipStatus(row.relationshipStatus), name: nonEmpty(row.name), contactEmail: nonEmpty(row.email) ?? nonEmpty(row.contactEmail), timeZone: row.timeZone };
    },
  };
}

/** The scan's place in the list of shops, kept in the one global sync checkpoint the tenant purge knows about. */
export function seatScanCursor(): SeatScanCursor {
  const checkpoints = shopSyncCheckpoints();
  return {
    read: async () => (await checkpoints.read(SEAT_SCAN_CHECKPOINT))?.cursor ?? null,
    write: (cursor, now) => checkpoints.markSucceeded(SEAT_SCAN_CHECKPOINT, cursor, now, now),
  };
}

/**
 * Everything the seat-overage review and the cron sweep run on: D1 for members and episodes, the plan's seats read FRESH
 * (this request's memo of the shop's subscription is dropped first), the queue through a notifier that says whether it took
 * the message, the app's own choice (`app/members/config.ts`), and a log that names a shop by its hash and carries no name
 * or address.
 */
export function seatOverageDependencies(config: SeatOverageConfig = MEMBERS.seatOverage): SeatSweepDependencies {
  const env = getEnv();
  const privilege = memberPrivilege();
  return {
    members: memberStore(),
    episodes: new MemberSeatEpisodeRepo(),
    seats: createMemberSeats(entitlements(), { forget: (shop) => forgetRequestMemo(subscriptionMemoKey(shop)) }),
    shops: seatShops(),
    ...(privilege ? { privilege } : {}),
    notifier: handoffNotifier(),
    config,
    runtime: appRuntime(),
    urls: { team: absolute(env.SHOPIFY_APP_URL, paths.members()), plan: absolute(env.SHOPIFY_APP_URL, paths.billing()) },
    scan: seatScanCursor(),
    log: ({ event, shop, ...fields }) => shopLog(event, shop, fields),
  };
}

/** The cron's sweep (`ScheduledDependencies.memberSeatOverage`). Under `never_remove` it returns before reading anything. */
export function memberSeatOverageSweep(): { run(now: number): Promise<Readonly<Record<string, number>>> } {
  return {
    // Nothing is even built for an app that never removes anyone: no binding is touched and no query is made.
    run: async (now) => (MEMBERS.seatOverage.policy === "never_remove" ? { policy_off: 1 } : sweepSeatOverage(now, seatOverageDependencies())),
  };
}

/**
 * The shop's plan changed (a subscription observed by webhook, history or refresh; a promotional plan granted or revoked):
 * drop the cached entitlements as before, then, only for an app that trims, review the shop's seats. The review runs after
 * the response (`runAfterResponse`: awaited where there is no request, in the queue and the cron), and a failure of it is
 * logged and never fails the plan change that triggered it. Under `never_remove` nothing is built and nothing is read (the
 * dependencies are made by a function, called only for an app that trims).
 */
export async function afterPlanChange(
  shop: string,
  config: SeatOverageConfig = MEMBERS.seatOverage,
  makeDependencies: () => SeatOverageDependencies = () => seatOverageDependencies(config),
): Promise<void> {
  await invalidateEntitlements(shop);
  if (config.policy === "never_remove") return;
  await runAfterResponse(
    async () => {
      await reviewSeatOverage(shop, appRuntime().clock.now(), makeDependencies());
    },
    (error) => shopLog("member.seat_review_failed", shop, { reason: error instanceof Error ? error.name : "unknown", trigger: "plan_change" }),
  );
}
