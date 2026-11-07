import {
  decideSeatOverage,
  deadlineFor,
  noticeRecipients,
  type NoneReason,
  type NoticeRecipient,
  type OpenEpisode,
  type OverageDecision,
  type OverageFacts,
  type OverageMember,
  type SeatOverageConfig,
  type WaitReason,
} from "~/domain/member-seat-overage";
import { toTimeZone, UTC } from "~/i18n/time-zone";
import type { SeatNoticePerson } from "~/notifications/payloads";
import type { MemberPrivilege, MemberSeatEpisodes, SeatEpisode, SeatShopFacts, SeatShops } from "~/ports/member-seat-overage";
import type { MemberSeats } from "~/ports/member-seats";
import type { Member, MemberStore } from "~/ports/members";
import type { HandoffNotifier } from "~/ports/notifier";
import type { Runtime } from "~/ports/runtime";

/**
 * What is worth a line in the log: counts and reasons, never a name or an address. The shop is named by its hash where the
 * log is written.
 */
export type SeatOverageLogEntry =
  | { readonly event: "member.seat_episode_opened"; readonly shop: string; readonly active: number; readonly limit: number }
  | { readonly event: "member.seat_notice_sent"; readonly shop: string; readonly recipients: number; readonly wouldTrim: number }
  | { readonly event: "member.seat_notice_failed"; readonly shop: string; readonly recipients: number }
  | { readonly event: "member.seat_review_waiting"; readonly shop: string; readonly reason: WaitReason }
  | { readonly event: "member.seat_episode_cancelled"; readonly shop: string; readonly reason: NoneReason }
  | { readonly event: "member.seat_nothing_trimmable"; readonly shop: string; readonly active: number; readonly limit: number }
  | { readonly event: "member.seats_trimmed"; readonly shop: string; readonly trimmed: number; readonly shortfall: number; readonly announced: boolean }
  | { readonly event: "member.seat_trim_blocked"; readonly shop: string; readonly wanted: number }
  | { readonly event: "member.seat_privilege_unavailable"; readonly shop: string }
  | { readonly event: "member.seat_review_failed"; readonly shop: string; readonly reason: string };

export interface SeatOverageDependencies {
  readonly members: Pick<MemberStore, "listActive" | "trim">;
  readonly episodes: MemberSeatEpisodes;
  /** The plan's limit, read strictly and fresh (`overageLimit`). */
  readonly seats: Pick<MemberSeats, "overageLimit">;
  readonly shops: SeatShops;
  /** The app's privilege scores, if it has any. Without it people are trimmed by role rank alone. */
  readonly privilege?: MemberPrivilege;
  /** Says whether a message was handed to the queue: the notice period starts only when it was. */
  readonly notifier: HandoffNotifier;
  readonly config: SeatOverageConfig;
  readonly runtime: Pick<Runtime, "ids">;
  /** Absolute links the notices carry, built where the app's URL is known. */
  readonly urls: { readonly team: string; readonly plan: string };
  readonly log: (entry: SeatOverageLogEntry) => void | Promise<void>;
}

export type SeatReviewOutcome =
  | "policy_off"
  | "nothing_to_do"
  | "notice_sent"
  | "notice_failed"
  | "waiting"
  | "cancelled"
  | "trimmed"
  | "trim_blocked"
  /** The episode this review meant to use was resolved by another review in the meantime; the next one starts again. */
  | "conflict";

/** At most this many people are named in a notice; the rest are counted. A notice is read, not scrolled. */
const NOTICE_PEOPLE_MAX = 10;

const noticeKey = (shop: string, episodeId: string): string => `seat-trim-notice:${shop}:${episodeId}`;
const trimmedKey = (shop: string, episodeId: string): string => `seats-trimmed:${shop}:${episodeId}`;

const openEpisodeOf = (episode: SeatEpisode): OpenEpisode => ({ id: episode.id, detectedAt: episode.detectedAt, notifiedAt: episode.notifiedAt, deadlineAt: episode.deadlineAt });

/** The shop's contact, for when no owner or admin has an address: the shop's own address, with its name. */
const shopContactOf = (shop: SeatShopFacts | undefined): { readonly email: string | null; readonly name: string | null } | null =>
  shop === undefined ? null : { email: shop.contactEmail, name: shop.name };

interface Gathered {
  readonly facts: OverageFacts;
  readonly members: readonly Member[];
  readonly shop: SeatShopFacts | undefined;
  readonly recipients: readonly NoticeRecipient[];
}

/** Everything the decision reads, taken together. The plan's limit is read FRESH here, at the moment of the review. */
async function gather(shop: string, now: number, deps: SeatOverageDependencies): Promise<Gathered> {
  const [shopFacts, limit, members, episode] = await Promise.all([deps.shops.facts(shop), deps.seats.overageLimit(shop), deps.members.listActive(shop), deps.episodes.findOpen(shop)]);
  const over = limit.kind === "limit" && members.length > limit.maximum;
  // `undefined` is "asked, and it failed"; an empty map is "nothing to say about anyone".
  const scores = over && deps.privilege ? await privilegeScores(shop, members, deps.privilege, deps.log) : new Map<string, number>();
  const active = members.map((member): OverageMember => {
    const privilege = scores?.get(member.id);
    return { id: member.id, role: member.role, permissions: member.permissions, accountOwner: member.accountOwner, lastSeenAt: member.lastSeenAt, createdAt: member.createdAt, ...(privilege === undefined ? {} : { privilege }) };
  });
  const recipients = noticeRecipients(members, shopContactOf(shopFacts));
  return {
    facts: {
      installed: shopFacts?.installed === true,
      limit,
      active,
      episode: episode === undefined ? undefined : openEpisodeOf(episode),
      recipients: recipients.length,
      privilegeUnavailable: scores === undefined,
      now,
    },
    members,
    shop: shopFacts,
    recipients,
  };
}

async function privilegeScores(shop: string, members: readonly Member[], privilege: MemberPrivilege, log: SeatOverageDependencies["log"]): Promise<ReadonlyMap<string, number> | undefined> {
  try {
    return await privilege.scores(shop, members.map((member) => member.id));
  } catch {
    // The failure is the fact: the trim order would be a guess, so the review waits (and says so).
    await log({ event: "member.seat_privilege_unavailable", shop });
    return undefined;
  }
}

/**
 * Looks at one shop's seats and carries out whatever the rules say: opens an episode, tells the people who can fix it,
 * cancels it when the reason is gone, or, once the notice period has run out and the shop is still over, takes the extra
 * people off their seats.
 *
 * Safe to run twice at once or twice in a row: opening an episode, recording the notice and closing it are each one
 * conditional write, a notice carries a dedupe key of the episode so the queue sends it once, and a trim is a statement
 * that refuses once the count is back at the limit. Never throws for something that is simply the case (an unreadable
 * plan, nobody to tell, a queue that is down): those are outcomes, and nothing is trimmed on any of them. A database error
 * is not an outcome and is thrown to the caller.
 *
 * `never_remove` (the template's default) does nothing, before any read.
 */
export async function reviewSeatOverage(shop: string, now: number, deps: SeatOverageDependencies): Promise<{ readonly outcome: SeatReviewOutcome }> {
  if (deps.config.policy === "never_remove") return { outcome: "policy_off" };
  let gathered = await gather(shop, now, deps);
  let decision = decideSeatOverage(gathered.facts, deps.config);

  if (decision.action === "open_episode") {
    const opened = await deps.episodes.open(shop, { id: deps.runtime.ids.uuid(), now });
    if (opened === undefined) return { outcome: "conflict" };
    if (opened.created) await deps.log({ event: "member.seat_episode_opened", shop, active: gathered.facts.active.length, limit: gathered.facts.limit.kind === "limit" ? gathered.facts.limit.maximum : 0 });
    gathered = { ...gathered, facts: { ...gathered.facts, episode: openEpisodeOf(opened.episode) } };
    decision = decideSeatOverage(gathered.facts, deps.config);
  }
  return { outcome: await carryOut(shop, now, decision, gathered, deps) };
}

async function carryOut(shop: string, now: number, decision: OverageDecision, gathered: Gathered, deps: SeatOverageDependencies): Promise<SeatReviewOutcome> {
  const episode = gathered.facts.episode;
  switch (decision.action) {
    case "none":
      if (decision.reason === "nothing_trimmable") await deps.log({ event: "member.seat_nothing_trimmable", shop, active: gathered.facts.active.length, limit: gathered.facts.limit.kind === "limit" ? gathered.facts.limit.maximum : 0 });
      return decision.reason === "policy_off" ? "policy_off" : "nothing_to_do";
    case "wait":
      await deps.log({ event: "member.seat_review_waiting", shop, reason: decision.reason });
      return "waiting";
    case "cancel_episode":
      if (episode !== undefined) await deps.episodes.resolve(shop, episode.id, { outcome: "cancelled", trimmedCount: null, now });
      await deps.log({ event: "member.seat_episode_cancelled", shop, reason: decision.reason });
      return "cancelled";
    case "send_notice":
      return episode === undefined ? "conflict" : sendNotice(shop, now, episode, decision, gathered, deps);
    case "trim":
      return episode === undefined ? "conflict" : trim(shop, now, episode, decision, gathered, deps);
    case "open_episode":
      // `reviewSeatOverage` opens the episode and decides again, so this is only reached if opening somehow decided to open.
      return "conflict";
    default:
      return assertNever(decision);
  }
}

function personOf(member: Member): SeatNoticePerson {
  return { name: member.name, email: member.email };
}

/** The people a notice names, capped, and how many more there are. */
function namedPeople(members: readonly Member[]): { readonly people: readonly SeatNoticePerson[]; readonly morePeople: number } {
  return { people: members.slice(0, NOTICE_PEOPLE_MAX).map(personOf), morePeople: Math.max(0, members.length - NOTICE_PEOPLE_MAX) };
}

async function sendNotice(
  shop: string,
  now: number,
  episode: OpenEpisode,
  decision: Extract<OverageDecision, { readonly action: "send_notice" }>,
  gathered: Gathered,
  deps: SeatOverageDependencies,
): Promise<SeatReviewOutcome> {
  const deadlineAt = deadlineFor(deps.config, now);
  // Only `notify_then_trim` reaches here, and it always has a deadline.
  if (deadlineAt === null) return "nothing_to_do";
  const byId = new Map(gathered.members.map((member) => [member.id, member]));
  const wouldTrim = decision.wouldTrim.flatMap((id) => byId.get(id) ?? []);
  const shopName = gathered.shop?.name ?? shop;
  const timeZone = toTimeZone(gathered.shop?.timeZone) ?? UTC;
  const results = await Promise.all(
    gathered.recipients.map((recipient) =>
      deps.notifier.handOff({
        event: "members_seat_trim_notice",
        to: { email: recipient.email },
        scope: shop,
        dedupeKey: noticeKey(shop, episode.id),
        payload: {
          recipientName: recipient.name ?? shopName,
          shopName,
          limit: decision.limit,
          used: gathered.facts.active.length,
          ...namedPeople(wouldTrim),
          deadlineAt,
          timeZone,
          teamUrl: deps.urls.team,
          planUrl: deps.urls.plan,
        },
      }),
    ),
  );
  // The notice period starts only when somebody was actually handed the notice. A queue that refused every message leaves
  // the episode un-notified, which can never lead to a trim, and the next review tries again.
  if (!results.some((result) => result.queued)) {
    await deps.log({ event: "member.seat_notice_failed", shop, recipients: gathered.recipients.length });
    return "notice_failed";
  }
  await deps.episodes.markNotified(shop, episode.id, { notifiedAt: now, deadlineAt });
  await deps.log({ event: "member.seat_notice_sent", shop, recipients: results.filter((result) => result.queued).length, wouldTrim: decision.wouldTrim.length });
  return "notice_sent";
}

async function trim(
  shop: string,
  now: number,
  episode: OpenEpisode,
  decision: Extract<OverageDecision, { readonly action: "trim" }>,
  gathered: Gathered,
  deps: SeatOverageDependencies,
): Promise<SeatReviewOutcome> {
  const trimmed: Member[] = [];
  // One at a time, in the order the rules chose. Each is a statement that re-checks, in the database, that the shop is
  // still over `decision.limit` (the limit read fresh a moment ago), so a review running beside this one cannot take more.
  for (const id of decision.ids) {
    const landed = await deps.members.trim(shop, id, decision.limit, now);
    if (landed !== undefined) trimmed.push(landed);
  }
  if (trimmed.length === 0) {
    await deps.log({ event: "member.seat_trim_blocked", shop, wanted: decision.ids.length });
    return "trim_blocked";
  }
  const announced = await announceTrimmed(shop, episode, trimmed, decision.limit, deps);
  // Notice first, then close: if this stops between the two, the next review sees a shop within its limit and cancels,
  // which leaves the record saying "cancelled" for a trim, but never loses the notice.
  await deps.episodes.resolve(shop, episode.id, { outcome: "trimmed", trimmedCount: trimmed.length, now });
  await deps.log({ event: "member.seats_trimmed", shop, trimmed: trimmed.length, shortfall: decision.shortfall, announced });
  return "trimmed";
}

/** Tells the people who run the team who lost their seat, and how to let them back in. Whether it was handed over. */
async function announceTrimmed(shop: string, episode: OpenEpisode, trimmed: readonly Member[], limit: number, deps: SeatOverageDependencies): Promise<boolean> {
  const [remaining, facts] = await Promise.all([deps.members.listActive(shop), deps.shops.facts(shop)]);
  const recipients = noticeRecipients(remaining, shopContactOf(facts));
  const shopName = facts?.name ?? shop;
  const results = await Promise.all(
    recipients.map((recipient) =>
      deps.notifier.handOff({
        event: "members_seats_trimmed",
        to: { email: recipient.email },
        scope: shop,
        dedupeKey: trimmedKey(shop, episode.id),
        payload: { recipientName: recipient.name ?? shopName, shopName, limit, ...namedPeople(trimmed), teamUrl: deps.urls.team, planUrl: deps.urls.plan },
      }),
    ),
  );
  return results.some((result) => result.queued);
}

function assertNever(value: never): never {
  throw new Error(`unhandled seat decision: ${JSON.stringify(value)}`);
}
