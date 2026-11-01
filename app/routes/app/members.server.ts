import { isMemberRole, type MemberPermission, type MemberRole } from "~/domain/member-access";
import { rolesToOffer, seatSummary, teamRows, toTeamMember, type SeatSummary, type TeamRow } from "~/domain/member-team";
import type { MemberActionResult } from "~/members/feedback";
import type { Member } from "~/ports/members";
import type { Runtime } from "~/ports/runtime";
import { approveMember, changeRole, inviteMember, removeMember, restoreMember, type ManageDependencies } from "~/services/members.server";

/**
 * The members page's server half, beside its route: what the page loads and what each of its forms does.
 *
 * `.server.ts` because every branch reaches the store; keeping it out of the route file also keeps that file under the
 * size target (@rules/architecture.md).
 */

export interface TeamPage {
  readonly rows: readonly TeamRow[];
  readonly seats: SeatSummary;
  /** How many people are waiting to be let in, for the banner. */
  readonly waiting: number;
  /** The roles the person looking may hand out. */
  readonly roles: readonly MemberRole[];
}

/** One batch of reads: the team, how many seats are in use, and what the plan allows. */
export async function loadTeam(actor: Pick<Member, "id" | "role" | "shop">, deps: Pick<ManageDependencies, "members" | "seats">): Promise<TeamPage> {
  const [members, counts, limit] = await Promise.all([deps.members.list(actor.shop), deps.members.countByStatus(actor.shop), deps.seats.limit(actor.shop)]);
  return {
    rows: teamRows(actor, members.map(toTeamMember)),
    seats: seatSummary(limit, counts.active),
    waiting: counts.pending,
    roles: rolesToOffer(actor.role),
  };
}

/** The role field, or undefined when it is not one of ours: a guard, never `as`. */
function readRole(form: FormData): MemberRole | undefined {
  const value = String(form.get("role") ?? "");
  return isMemberRole(value) ? value : undefined;
}

const readId = (form: FormData): string => String(form.get("id") ?? "");

/** What the page's forms run on: the management use cases' dependencies, and the ids an invitation needs. */
export type TeamDependencies = ManageDependencies & { readonly runtime: Pick<Runtime, "clock" | "ids"> };

interface IntentContext {
  readonly actor: Member;
  readonly deps: TeamDependencies;
}

interface MemberIntent {
  /** The permission the person needs for it. Checked before the form is read for anything else. */
  readonly needs: MemberPermission;
  readonly run: (form: FormData, context: IntentContext) => Promise<MemberActionResult>;
}

const roleInvalid: MemberActionResult = { error: "roleInvalid" };
const failed = (reason: Extract<MemberActionResult, { error: unknown }>["error"]): MemberActionResult => ({ error: reason });

/**
 * Command dispatch on `intent` (@rules/design-patterns.md): the action is a thin lookup, and each intent's logic lives in
 * a use case. Adding one is one entry here, one in `MEMBER_SUCCESSES`, and words in the catalogue.
 */
export const MEMBER_INTENTS = {
  invite: {
    needs: "members:manage",
    async run(form, { actor, deps }) {
      const role = readRole(form);
      if (!role) return roleInvalid;
      const invited = await inviteMember({ actor, email: String(form.get("email") ?? ""), role }, deps);
      return invited.ok ? { success: "invited" } : failed(invited.reason);
    },
  },
  changeRole: {
    needs: "members:manage",
    async run(form, { actor, deps }) {
      const role = readRole(form);
      if (!role) return roleInvalid;
      const changed = await changeRole({ actor, targetId: readId(form), role }, deps);
      return changed.ok ? { success: "roleChanged" } : failed(changed.reason);
    },
  },
  remove: {
    needs: "members:manage",
    async run(form, { actor, deps }) {
      const removed = await removeMember({ actor, targetId: readId(form) }, deps);
      if (!removed.ok) return failed(removed.reason);
      // An invitation nobody took up has no person behind it: say it was cancelled, not that someone was removed.
      return { success: removed.value.shopifyUserId === null ? "invitationCancelled" : "removed" };
    },
  },
  approve: {
    needs: "members:manage",
    async run(form, { actor, deps }) {
      const role = readRole(form);
      if (!role) return roleInvalid;
      const approved = await approveMember({ actor, targetId: readId(form), role }, deps);
      return approved.ok ? { success: "approved" } : failed(approved.reason);
    },
  },
  restore: {
    needs: "members:manage",
    async run(form, { actor, deps }) {
      const role = readRole(form);
      if (!role) return roleInvalid;
      const restored = await restoreMember({ actor, targetId: readId(form), role }, deps);
      return restored.ok ? { success: "restored" } : failed(restored.reason);
    },
  },
} as const satisfies Record<string, MemberIntent>;

export type MemberIntentName = keyof typeof MEMBER_INTENTS;

/** The submitted intent, or undefined: a guard, so a forged value is never treated as one of ours. */
export function readIntent(form: FormData): MemberIntentName | undefined {
  const value = String(form.get("intent") ?? "");
  return Object.keys(MEMBER_INTENTS).find((name): name is MemberIntentName => name === value);
}

/** Runs one intent. Unknown intents are an error result, never a crash. */
export async function runIntent(form: FormData, context: IntentContext): Promise<MemberActionResult> {
  const intent = readIntent(form);
  return intent === undefined ? { error: "unknownIntent" } : MEMBER_INTENTS[intent].run(form, context);
}
