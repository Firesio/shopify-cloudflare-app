import { can, type MemberPermission, type MemberRole } from "./member-access";
import type { OverageLimit } from "./member-seats";

/**
 * What happens when a shop has more ACTIVE members than its plan's seats. PURE: facts in, one decision out, so every rule
 * is testable with no database, no clock and no framework. The service (`services/members/review-seat-overage`) gathers
 * the facts and carries the decision out.
 *
 * This is OPT-IN. The shipped policy, `never_remove`, is the behaviour the template always had: a plan change removes
 * nobody, and nothing in this file does anything. An app that wants a team held to its plan chooses `notify_then_trim`:
 *
 *   1. the shop is over its limit               -> an EPISODE opens
 *   2. the people who can fix it are told       -> the episode records WHEN, and the deadline is that moment + `noticeHours`
 *   3. the deadline passes, still over          -> exactly `active - limit` people lose their seat (they become `pending`,
 *                                                  marked trimmed, and are let back in by a person)
 *   4. back within the limit at any time before -> the episode is cancelled and nobody is touched
 *
 * Three promises that no configuration weakens:
 *   - nobody is trimmed for a limit that was not read strictly (`overageLimitFrom`): a refusal is not a limit of zero;
 *   - nobody is trimmed unless someone was told first: a shop whose notice cannot be sent is never trimmed;
 *   - owners (and Shopify's account owner) are never trimmed, and the shop always keeps a member who can manage the team.
 */

/** The app's choice, in `app/members/config.ts`. A union, so `noticeHours` exists only for the policy that uses it. */
export type SeatOverageConfig =
  | { readonly policy: "never_remove" }
  | { readonly policy: "notify_then_trim"; readonly noticeHours: number };

/** How long the notice period may be. Under an hour is not a notice; over a week is a shop left over its plan for a long time. */
export const NOTICE_HOURS_MIN = 1;
export const NOTICE_HOURS_MAX = 168;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The name of the ONE global checkpoint row the cron's scan keeps: its `cursor` is the last shop it reached, so a bounded
 * batch per tick eventually covers every shop. The tenant purge clears it when the cursor is the purged shop.
 */
export const SEAT_SCAN_CHECKPOINT = "member_seat_overage_scan";

/** What is wrong with the notice period, in words, or null. Used by `memberConfigProblems`. */
export function noticeHoursProblem(config: SeatOverageConfig): string | null {
  if (config.policy === "never_remove") return null;
  const hours = config.noticeHours;
  if (!Number.isInteger(hours) || hours < NOTICE_HOURS_MIN || hours > NOTICE_HOURS_MAX) {
    return `seatOverage.noticeHours must be a whole number from ${NOTICE_HOURS_MIN} to ${NOTICE_HOURS_MAX}, not ${String(hours)}.`;
  }
  return null;
}

/** When a notice handed over at `notifiedAt` runs out. Only meaningful for `notify_then_trim`; `never_remove` has no deadline. */
export function deadlineFor(config: SeatOverageConfig, notifiedAt: number): number | null {
  return config.policy === "never_remove" ? null : notifiedAt + config.noticeHours * HOUR_MS;
}

// ─── Who goes first ───────────────────────────────────────────────────────────

/**
 * Where a role stands in a trim: lower goes first. `null` is a role that is NEVER trimmed. Keyed by the role union, so a
 * new role cannot be added without saying where it stands. A member with a set of their own stands where the role they
 * started from does (what they can do is read from the set wherever it matters: `can`).
 */
const TRIM_RANK: Readonly<Record<MemberRole, number | null>> = { viewer: 0, member: 1, admin: 2, owner: null };

/** What the trim reads of an active member. */
export interface OverageMember {
  readonly id: string;
  readonly role: MemberRole;
  /**
   * The member's own set, when they have one: it decides whether they can manage the team (`can`), whatever role they were
   * based on. Without one, their role's preset applies.
   */
  readonly permissions?: readonly MemberPermission[] | null;
  /** Shopify said this user owns the store: never trimmed, like an owner, because they come back as one the moment they open the app. */
  readonly accountOwner: boolean;
  readonly lastSeenAt: number | null;
  readonly createdAt: number;
  /**
   * What the app says this person can do beyond their role, higher is more (an app supplies it through the optional
   * `MemberPrivilege` port). Absent is treated as the MOST privileged, so someone the app could not score is protected
   * rather than trimmed first; when nobody has a score, this tier does not separate anyone.
   */
  readonly privilege?: number;
}

const compare = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

/** First trimmed first: role rank, fewer privileges, longest unseen (never seen first), newest member, then id so the order is total. */
function trimOrder(a: OverageMember, b: OverageMember): number {
  return (
    compare(TRIM_RANK[a.role] ?? Number.POSITIVE_INFINITY, TRIM_RANK[b.role] ?? Number.POSITIVE_INFINITY) ||
    compare(a.privilege ?? Number.POSITIVE_INFINITY, b.privilege ?? Number.POSITIVE_INFINITY) ||
    compare(a.lastSeenAt ?? Number.NEGATIVE_INFINITY, b.lastSeenAt ?? Number.NEGATIVE_INFINITY) ||
    compare(b.createdAt, a.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export interface TrimSelection {
  /** Who loses a seat, first to last. At most `active - limit`. */
  readonly ids: readonly string[];
  /** How many seats could NOT be freed because the only people left to take are protected (owners, the last team manager). */
  readonly shortfall: number;
}

/**
 * Exactly `active - limit` people, never more, never an owner, and never the last active member who holds
 * `members:manage`: a protected person is skipped and the next candidate taken, and when the protection stops the count
 * short the rest is left (`shortfall`), not forced.
 */
export function selectTrimmed(active: readonly OverageMember[], limit: number): TrimSelection {
  const needed = Math.max(0, active.length - limit);
  const candidates = active.filter((member) => !member.accountOwner && TRIM_RANK[member.role] !== null).sort(trimOrder);
  let managers = active.filter((member) => can(member, "members:manage")).length;
  const ids: string[] = [];
  for (const candidate of candidates) {
    if (ids.length >= needed) break;
    const manages = can(candidate, "members:manage");
    // Taking the last manager would leave a shop nobody can manage the team of.
    if (manages && managers <= 1) continue;
    ids.push(candidate.id);
    if (manages) managers -= 1;
  }
  return { ids, shortfall: needed - ids.length };
}

// ─── Who is told ──────────────────────────────────────────────────────────────

export interface NoticeRecipient {
  readonly email: string;
  readonly name: string | null;
}

interface Contactable {
  readonly role: MemberRole;
  readonly email: string | null;
  readonly name: string | null;
  /** A member with a set of their own is not reached by role: they cannot be assumed to be able to fix a seat problem. */
  readonly permissions?: readonly MemberPermission[] | null;
}

/**
 * Who hears about it: active owners with an address; failing that active admins with one; failing that the shop's own
 * contact address if the app passes one; else nobody. One entry per address. Someone with a set of their own is never
 * reached by role, whatever role they were based on.
 */
export function noticeRecipients(active: readonly Contactable[], shopContact: { readonly email: string | null; readonly name: string | null } | null): readonly NoticeRecipient[] {
  const reachable = (role: MemberRole): NoticeRecipient[] => {
    const seen = new Set<string>();
    const found: NoticeRecipient[] = [];
    for (const member of active) {
      const email = member.email?.trim().toLowerCase() ?? "";
      if (member.role !== role || (member.permissions ?? null) !== null || email === "" || seen.has(email)) continue;
      seen.add(email);
      found.push({ email, name: member.name });
    }
    return found;
  };
  for (const role of ["owner", "admin"] as const) {
    const found = reachable(role);
    if (found.length > 0) return found;
  }
  const email = shopContact?.email?.trim().toLowerCase() ?? "";
  return email === "" || shopContact === null ? [] : [{ email, name: shopContact.name }];
}

// ─── The decision ─────────────────────────────────────────────────────────────

/** An episode that is still open: the shop went over its limit at `detectedAt`. */
export interface OpenEpisode {
  readonly id: string;
  readonly detectedAt: number;
  /** When the notice was successfully handed to the notifier. Null until then. */
  readonly notifiedAt: number | null;
  /** `notifiedAt` + the notice period. Null until the notice was sent. */
  readonly deadlineAt: number | null;
}

export interface OverageFacts {
  /** The app is installed on the shop now. A shop that is not is nobody's to notify or trim. */
  readonly installed: boolean;
  /** The plan's limit, read strictly and FRESH (never from a cache) at the moment of the review. */
  readonly limit: OverageLimit;
  readonly active: readonly OverageMember[];
  readonly episode: OpenEpisode | undefined;
  /** How many people can be told (`noticeRecipients`). */
  readonly recipients: number;
  /** The app supplies privilege scores and asking for them failed: the trim order would be a guess. */
  readonly privilegeUnavailable: boolean;
  readonly now: number;
}

export type NoneReason = "policy_off" | "not_installed" | "within_limit" | "unlimited" | "limit_unknown" | "nothing_trimmable";
export type WaitReason = "no_recipient" | "limit_unknown" | "before_deadline" | "privilege_unavailable";

export type OverageDecision =
  | { readonly action: "none"; readonly reason: NoneReason }
  /** Over the limit with no episode: open one (the caller then decides again with it). */
  | { readonly action: "open_episode" }
  /** The reason to act is gone (a seat freed, a plan upgraded, the app uninstalled): resolve the episode as cancelled. */
  | { readonly action: "cancel_episode"; readonly reason: NoneReason }
  /** Tell the people who can fix it, who would be removed if nothing changes, and when. */
  | { readonly action: "send_notice"; readonly over: number; readonly limit: number; readonly wouldTrim: readonly string[] }
  | { readonly action: "wait"; readonly reason: WaitReason }
  /** Past the deadline and still over: these people, in this order, against this fresh limit. */
  | { readonly action: "trim"; readonly ids: readonly string[]; readonly limit: number; readonly shortfall: number };

/** The one decision. Reads nothing but its arguments. */
export function decideSeatOverage(facts: OverageFacts, config: SeatOverageConfig): OverageDecision {
  if (config.policy === "never_remove") return { action: "none", reason: "policy_off" };
  const { episode, limit, active } = facts;
  const closeOr = (reason: NoneReason): OverageDecision => (episode ? { action: "cancel_episode", reason } : { action: "none", reason });

  if (!facts.installed) return closeOr("not_installed");
  if (limit.kind === "unlimited") return closeOr("unlimited");
  // An unreadable limit never opens an episode and never moves one forward; an open one just waits for a readable answer.
  if (limit.kind === "unknown") return episode ? { action: "wait", reason: "limit_unknown" } : { action: "none", reason: "limit_unknown" };
  if (active.length <= limit.maximum) return closeOr("within_limit");

  const selection = selectTrimmed(active, limit.maximum);
  // Over the limit, but everyone who could be removed is protected: telling people to fix what nobody can enforce is noise.
  if (selection.ids.length === 0) return closeOr("nothing_trimmable");

  if (!episode) return { action: "open_episode" };
  if (episode.notifiedAt === null) {
    if (facts.recipients === 0) return { action: "wait", reason: "no_recipient" };
    return { action: "send_notice", over: active.length - limit.maximum, limit: limit.maximum, wouldTrim: selection.ids };
  }
  // The deadline stored with the episode is the one the people were promised, even if `noticeHours` changed since.
  const deadline = episode.deadlineAt ?? deadlineFor(config, episode.notifiedAt);
  if (deadline === null || facts.now < deadline) return { action: "wait", reason: "before_deadline" };
  if (facts.privilegeUnavailable) return { action: "wait", reason: "privilege_unavailable" };
  return { action: "trim", ids: selection.ids, limit: limit.maximum, shortfall: selection.shortfall };
}
