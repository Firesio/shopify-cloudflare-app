import { encodeBase32, otpauthUri, TOTP_SECRET_BYTES, decodeBase32, verifyTotp } from "~/lib/totp";
import { open, seal, SECRET_BOX_IV_BYTES } from "~/lib/secret-box";
import { hashToken } from "~/lib/token";
import { err, ok, type Result } from "~/lib/result";
import type { Runtime } from "~/ports/runtime";
import type { StaffMfaStore } from "~/ports/staff-mfa";

/**
 * Staff two-step verification (TOTP plus single-use recovery codes).
 *
 * `key` is null when `STAFF_MFA_KEY` is not configured: enrollment is then
 * refused, and a sign-in for someone already enrolled FAILS CLOSED rather than
 * skipping the second factor.
 */
export interface StaffMfaDependencies {
  readonly store: StaffMfaStore;
  readonly key: CryptoKey | null;
  readonly runtime: Runtime;
  /** The issuer shown in the authenticator app, e.g. the product name. */
  readonly issuer: string;
}

/** How long a started-but-unconfirmed setup stays usable. */
export const PENDING_SETUP_MS = 15 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;
/** 80 bits per code: 16 base32 characters, shown as four groups of four. */
const RECOVERY_CODE_BYTES = 10;

export type MfaStatus = {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly enabledAt: number | null;
  readonly recoveryCodesLeft: number;
};

export type MfaSetup = { readonly secret: string; readonly uri: string };

export type MfaFailure =
  | "unavailable"
  | "alreadyEnabled"
  | "notEnabled"
  | "noPendingSetup"
  | "invalidCode";

export type SecondFactor = "totp" | "recovery_code";

export async function mfaStatus(adminUserId: string, deps: StaffMfaDependencies): Promise<MfaStatus> {
  const state = await deps.store.find(adminUserId);
  const enabled = Boolean(state?.secret);
  return {
    available: deps.key !== null,
    enabled,
    enabledAt: state?.enabledAt ?? null,
    recoveryCodesLeft: enabled ? await deps.store.countUnusedRecoveryCodes(adminUserId) : 0,
  };
}

export async function isMfaEnabled(adminUserId: string, deps: Pick<StaffMfaDependencies, "store">): Promise<boolean> {
  return Boolean((await deps.store.find(adminUserId))?.secret);
}

/** Generate a fresh secret and park it as pending; the caller shows it once. */
export async function startMfaEnrollment(
  actor: { readonly id: string; readonly email: string },
  deps: StaffMfaDependencies,
): Promise<Result<MfaSetup, MfaFailure>> {
  if (!deps.key) return err("unavailable");
  if (await isMfaEnabled(actor.id, deps)) return err("alreadyEnabled");
  const secret = encodeBase32(deps.runtime.randomBytes(TOTP_SECRET_BYTES));
  const sealed = await seal(deps.key, secret, deps.runtime.randomBytes(SECRET_BOX_IV_BYTES));
  await deps.store.savePending(actor.id, sealed, deps.runtime.clock.now());
  return ok({ secret, uri: otpauthUri({ issuer: deps.issuer, account: actor.email, secret }) });
}

/** The pending setup to show again (after a reload), while it is still fresh. */
export async function pendingMfaSetup(
  actor: { readonly id: string; readonly email: string },
  deps: StaffMfaDependencies,
): Promise<MfaSetup | null> {
  if (!deps.key) return null;
  const state = await deps.store.find(actor.id);
  if (!state?.pendingSecret || state.secret || !isFresh(state.pendingCreatedAt, deps.runtime.clock.now())) return null;
  const secret = await open(deps.key, state.pendingSecret);
  return secret === null ? null : { secret, uri: otpauthUri({ issuer: deps.issuer, account: actor.email, secret }) };
}

/** Check a code from the new authenticator; on success MFA is on and the recovery codes are returned ONCE. */
export async function confirmMfaEnrollment(
  adminUserId: string,
  code: string,
  deps: StaffMfaDependencies,
): Promise<Result<{ readonly recoveryCodes: readonly string[] }, MfaFailure>> {
  if (!deps.key) return err("unavailable");
  const state = await deps.store.find(adminUserId);
  if (state?.secret) return err("alreadyEnabled");
  const now = deps.runtime.clock.now();
  if (!state?.pendingSecret || !isFresh(state.pendingCreatedAt, now)) return err("noPendingSetup");
  const secret = await openSecret(deps.key, state.pendingSecret);
  if (!secret) return err("noPendingSetup");
  const check = await verifyTotp(secret, code, now, null);
  if (!check.ok) return err("invalidCode");
  const codes = generateRecoveryCodes(deps.runtime);
  const confirmed = await deps.store.confirm(adminUserId, state.pendingSecret, check.step, await hashCodes(codes), now);
  return confirmed ? ok({ recoveryCodes: codes }) : err("noPendingSetup");
}

/**
 * The second factor at sign-in, or before a sensitive change: a current TOTP
 * code (used at most once) or an unused recovery code (spent on use).
 */
export async function verifySecondFactor(
  adminUserId: string,
  input: string,
  deps: StaffMfaDependencies,
): Promise<Result<SecondFactor, MfaFailure>> {
  const state = await deps.store.find(adminUserId);
  if (!state?.secret) return err("notEnabled");
  if (!deps.key) return err("unavailable");
  const now = deps.runtime.clock.now();
  const recovery = normalizeRecoveryCode(input);
  if (recovery !== null) {
    return (await deps.store.useRecoveryCode(adminUserId, await hashToken(recovery), now)) ? ok("recovery_code") : err("invalidCode");
  }
  const secret = await openSecret(deps.key, state.secret);
  if (!secret) {
    // A secret this key cannot open means STAFF_MFA_KEY changed. Refuse (never skip the factor) and say why in the logs.
    console.error(JSON.stringify({ event: "staff_mfa.secret_unreadable" }));
    return err("unavailable");
  }
  const check = await verifyTotp(secret, input, now, state.lastStep);
  if (!check.ok) return err("invalidCode");
  return (await deps.store.claimStep(adminUserId, check.step, now)) ? ok("totp") : err("invalidCode");
}

/** Turn MFA off for oneself; requires a valid second factor. */
export async function disableMfa(
  adminUserId: string,
  code: string,
  deps: StaffMfaDependencies,
): Promise<Result<SecondFactor, MfaFailure>> {
  const verified = await verifySecondFactor(adminUserId, code, deps);
  if (verified.ok) await deps.store.remove(adminUserId);
  return verified;
}

/** Replace every recovery code (the old ones stop working); requires a valid second factor. */
export async function regenerateRecoveryCodes(
  adminUserId: string,
  code: string,
  deps: StaffMfaDependencies,
): Promise<Result<{ readonly recoveryCodes: readonly string[] }, MfaFailure>> {
  const verified = await verifySecondFactor(adminUserId, code, deps);
  if (!verified.ok) return verified;
  const codes = generateRecoveryCodes(deps.runtime);
  await deps.store.replaceRecoveryCodes(adminUserId, await hashCodes(codes), deps.runtime.clock.now());
  return ok({ recoveryCodes: codes });
}

/** An owner clearing someone else's MFA (lost phone and lost codes). Authorisation is the caller's. */
export async function resetMfa(adminUserId: string, deps: Pick<StaffMfaDependencies, "store">): Promise<void> {
  await deps.store.remove(adminUserId);
}

function isFresh(createdAt: number | null, now: number): boolean {
  return createdAt !== null && now - createdAt <= PENDING_SETUP_MS;
}

async function openSecret(key: CryptoKey, sealed: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const base32 = await open(key, sealed);
  return base32 === null ? null : decodeBase32(base32);
}

function generateRecoveryCodes(runtime: Pick<Runtime, "randomBytes">): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = encodeBase32(runtime.randomBytes(RECOVERY_CODE_BYTES));
    return raw.match(/.{1,4}/g)?.join("-") ?? raw;
  });
}

/**
 * The canonical form of a typed recovery code (upper case, no dashes or
 * spaces), or null when the input is a six-digit TOTP code instead.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{6}$/.test(compact)) return null;
  return compact;
}

function hashCodes(codes: readonly string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hashToken(code.replace(/-/g, ""))));
}
