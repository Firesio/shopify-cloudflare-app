import { describeConsoleRequest, type StaffAuditKind } from "~/domain/staff-audit";
import type { Runtime } from "~/ports/runtime";
import type { StaffAuditLog } from "~/ports/staff-audit";

export interface StaffAuditDependencies {
  readonly log: StaffAuditLog;
  readonly runtime: Pick<Runtime, "clock" | "ids">;
}

export interface StaffActor {
  readonly id: string;
  readonly email: string;
}

/**
 * Record that `actor` made this console request. Awaited, and a failure is NOT
 * swallowed: a console request whose access cannot be recorded is refused
 * (the caller's error boundary answers), so the trail has no silent gaps.
 */
export async function recordConsoleAccess(
  request: Request,
  actor: StaffActor,
  deps: StaffAuditDependencies,
): Promise<void> {
  const described = describeConsoleRequest(request.method, new URL(request.url));
  await deps.log.record({
    id: deps.runtime.ids.uuid(),
    adminUserId: actor.id,
    actorEmail: actor.email,
    kind: "access",
    method: described.method,
    path: described.path,
    shop: described.shop,
    at: deps.runtime.clock.now(),
  });
}

/**
 * A sign-in, sign-out or second-factor event. `path` names what was acted on
 * when it is not the actor themself (an owner resetting a colleague's MFA).
 */
export async function recordStaffEvent(
  kind: Exclude<StaffAuditKind, "access">,
  actor: StaffActor,
  deps: StaffAuditDependencies,
  path: string | null = null,
): Promise<void> {
  await deps.log.record({
    id: deps.runtime.ids.uuid(),
    adminUserId: actor.id,
    actorEmail: actor.email,
    kind,
    method: null,
    path,
    shop: null,
    at: deps.runtime.clock.now(),
  });
}
