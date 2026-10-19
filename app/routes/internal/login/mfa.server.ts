import { data, redirect } from "react-router";
import { authClientKey } from "~/lib/auth-client-key";
import type { Result } from "~/lib/result";
import type { SafeAdminUser } from "~/ports/admin-users";
import type { AuthAttemptLimiter } from "~/ports/auth-rate-limit";
import { LOGIN_PATH } from "~/services/admin-auth.server";
import type { MfaFailure, SecondFactor } from "~/services/staff-mfa";

export type MfaChallengeError = "missingCode" | "invalidCode" | "rateLimited" | "unavailable";

export type MfaActionDeps = {
  readonly limiter: AuthAttemptLimiter;
  readonly productionLike: boolean;
  readonly readChallenge: (request: Request) => Promise<{ readonly adminUserId: string; readonly next: string } | undefined>;
  readonly findUser: (adminUserId: string) => Promise<SafeAdminUser | undefined>;
  readonly verify: (adminUserId: string, code: string) => Promise<Result<SecondFactor, MfaFailure>>;
  readonly recordFailure: (user: SafeAdminUser) => Promise<void>;
  readonly recordRecoveryCodeUse: (user: SafeAdminUser) => Promise<void>;
  readonly completeSignIn: (user: SafeAdminUser, next: string) => Promise<Response>;
};

/**
 * The second sign-in step. Parse → check the pending password step → limit →
 * verify → sign in. No pending step (expired, or never passed the password)
 * goes back to the password form: this page can never sign anyone in alone.
 */
export async function handleMfaAction(request: Request, deps: MfaActionDeps) {
  const challenge = await deps.readChallenge(request);
  if (!challenge) throw redirect(LOGIN_PATH);

  // Keyed by account AND client: one attacker cannot lock a colleague out, and one account cannot be guessed at
  // from many addresses faster than from one.
  const limit = await deps.limiter.check(`mfa:${challenge.adminUserId}:${authClientKey(request)}`);
  if (limit === "limited") return data({ error: "rateLimited" as const }, { status: 429 });
  if (limit === "unavailable" && deps.productionLike) return data({ error: "unavailable" as const }, { status: 503 });

  const user = await deps.findUser(challenge.adminUserId);
  if (!user || user.status !== "active") throw redirect(LOGIN_PATH);

  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  if (!code) return data({ error: "missingCode" as const }, { status: 400 });

  const verified = await deps.verify(user.id, code);
  if (!verified.ok) {
    // `notEnabled` means MFA was reset between the two steps; the password step must be redone, never skipped.
    if (verified.reason === "notEnabled") throw redirect(LOGIN_PATH);
    if (verified.reason === "unavailable") return data({ error: "unavailable" as const }, { status: 503 });
    await deps.recordFailure(user);
    return data({ error: "invalidCode" as const }, { status: 401 });
  }
  if (verified.value === "recovery_code") await deps.recordRecoveryCodeUse(user);
  return deps.completeSignIn(user, challenge.next);
}
