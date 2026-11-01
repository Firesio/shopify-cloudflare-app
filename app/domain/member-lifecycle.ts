/**
 * The life of a membership. PURE.
 *
 *   invited   someone asked for this person by email; no Shopify user is linked yet. Taken up, it becomes `active`, or
 *             `pending` when the plan has no free seat for another active member
 *   pending   a Shopify user opened the app and is waiting for a person to let them in
 *   active    may use the app, as their role allows
 *   removed   was taken out on purpose. They do not come back by opening the app again, whatever the app's policy for
 *             strangers is; someone has to restore them.
 *
 * Transitions are DATA with one funnel (`canTransition`), like every other lifecycle here.
 */
export const MEMBER_STATUSES = ["invited", "pending", "active", "removed"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_TRANSITIONS: Readonly<Record<MemberStatus, readonly MemberStatus[]>> = {
  invited: ["active", "pending", "removed"],
  pending: ["active", "removed"],
  active: ["removed"],
  removed: ["active"],
};

export function canTransition(from: MemberStatus, to: MemberStatus): boolean {
  return MEMBER_TRANSITIONS[from].includes(to);
}

/** A stored status the code no longer knows is not a status: a real guard, the value came from a column. */
export function isMemberStatus(value: string): value is MemberStatus {
  return Object.prototype.hasOwnProperty.call(MEMBER_TRANSITIONS, value);
}
