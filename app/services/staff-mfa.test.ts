import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveSecretBoxKey } from "~/lib/secret-box";
import { decodeBase32, hotp, totpStep } from "~/lib/totp";
import { fakeRuntime } from "~/test/fake-runtime";
import { fakeStaffMfaStore } from "~/test/fake-staff-mfa";
import {
  confirmMfaEnrollment,
  disableMfa,
  isMfaEnabled,
  mfaStatus,
  normalizeRecoveryCode,
  pendingMfaSetup,
  PENDING_SETUP_MS,
  RECOVERY_CODE_COUNT,
  regenerateRecoveryCodes,
  resetMfa,
  startMfaEnrollment,
  verifySecondFactor,
  type StaffMfaDependencies,
} from "./staff-mfa";

const ACTOR = { id: "staff-1", email: "sam@team.dev" };

async function setup(options: { key?: "configured" | "missing" } = {}) {
  const runtime = fakeRuntime({ start: 1_800_000_000_000 });
  const store = fakeStaffMfaStore();
  const key = options.key === "missing" ? null : await deriveSecretBoxKey("mfa-test-key", "staff-totp-v1");
  const deps: StaffMfaDependencies = { store, key, runtime, issuer: "Useful App" };
  const codeFor = async (secret: string, offsetSteps = 0) => {
    const bytes = decodeBase32(secret);
    if (!bytes) throw new Error("fixture: bad secret");
    return hotp(bytes, totpStep(runtime.clock.now()) + offsetSteps);
  };
  return { runtime, store, deps, codeFor };
}

async function enrolled() {
  const context = await setup();
  const started = await startMfaEnrollment(ACTOR, context.deps);
  if (!started.ok) throw new Error(`fixture: ${started.reason}`);
  const confirmed = await confirmMfaEnrollment(ACTOR.id, await context.codeFor(started.value.secret), context.deps);
  if (!confirmed.ok) throw new Error(`fixture: ${confirmed.reason}`);
  // Move to the next step so the code used to confirm is not the current one.
  context.runtime.clock.advance(30_000);
  return { ...context, secret: started.value.secret, recoveryCodes: confirmed.value.recoveryCodes };
}

afterEach(() => vi.restoreAllMocks());

describe("enrollment", () => {
  it("starts with a base32 secret and an otpauth URI naming the account, but is not on yet", async () => {
    const { deps } = await setup();
    const started = await startMfaEnrollment(ACTOR, deps);
    expect(started.ok && started.value.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(started.ok && started.value.uri).toContain("otpauth://totp/Useful%20App:sam%40team.dev?secret=");
    expect(await isMfaEnabled(ACTOR.id, deps)).toBe(false);
  });

  it("stores the secret sealed, never in clear", async () => {
    const { deps, store } = await setup();
    const started = await startMfaEnrollment(ACTOR, deps);
    const state = await store.find(ACTOR.id);
    expect(state?.pendingSecret?.startsWith("v1.")).toBe(true);
    expect(state?.pendingSecret).not.toContain(started.ok ? started.value.secret : "?");
  });

  it("turns on with a valid code and hands out the recovery codes once", async () => {
    const { deps, codeFor } = await setup();
    const started = await startMfaEnrollment(ACTOR, deps);
    if (!started.ok) throw new Error("fixture");
    const confirmed = await confirmMfaEnrollment(ACTOR.id, await codeFor(started.value.secret), deps);
    expect(confirmed.ok && confirmed.value.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(confirmed.ok && confirmed.value.recoveryCodes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect(await mfaStatus(ACTOR.id, deps)).toMatchObject({ available: true, enabled: true, recoveryCodesLeft: RECOVERY_CODE_COUNT });
  });

  it("stays off after a wrong code", async () => {
    const { deps } = await setup();
    await startMfaEnrollment(ACTOR, deps);
    expect(await confirmMfaEnrollment(ACTOR.id, "000000", deps)).toMatchObject({ ok: false, reason: "invalidCode" });
    expect(await isMfaEnabled(ACTOR.id, deps)).toBe(false);
  });

  it("refuses to confirm a setup that was never started, or has gone stale", async () => {
    const { deps, runtime, codeFor } = await setup();
    expect(await confirmMfaEnrollment(ACTOR.id, "123456", deps)).toMatchObject({ reason: "noPendingSetup" });
    const started = await startMfaEnrollment(ACTOR, deps);
    if (!started.ok) throw new Error("fixture");
    runtime.clock.advance(PENDING_SETUP_MS + 1);
    expect(await pendingMfaSetup(ACTOR, deps)).toBeNull();
    expect(await confirmMfaEnrollment(ACTOR.id, await codeFor(started.value.secret), deps)).toMatchObject({ reason: "noPendingSetup" });
  });

  it("shows a fresh pending setup again after a reload", async () => {
    const { deps } = await setup();
    const started = await startMfaEnrollment(ACTOR, deps);
    expect(await pendingMfaSetup(ACTOR, deps)).toEqual(started.ok ? started.value : null);
  });

  it("refuses to start twice once on, and refuses entirely without STAFF_MFA_KEY", async () => {
    const { deps } = await enrolled();
    expect(await startMfaEnrollment(ACTOR, deps)).toMatchObject({ reason: "alreadyEnabled" });
    const missing = await setup({ key: "missing" });
    expect(await startMfaEnrollment(ACTOR, missing.deps)).toMatchObject({ reason: "unavailable" });
    expect((await mfaStatus(ACTOR.id, missing.deps)).available).toBe(false);
  });
});

describe("verifySecondFactor", () => {
  it("accepts the current code once, and refuses the same code again", async () => {
    const { deps, codeFor, secret } = await enrolled();
    const code = await codeFor(secret);
    expect(await verifySecondFactor(ACTOR.id, code, deps)).toEqual({ ok: true, value: "totp" });
    expect(await verifySecondFactor(ACTOR.id, code, deps)).toMatchObject({ ok: false, reason: "invalidCode" });
  });

  it("refuses the code that confirmed enrollment (it is already spent)", async () => {
    const context = await setup();
    const started = await startMfaEnrollment(ACTOR, context.deps);
    if (!started.ok) throw new Error("fixture");
    const code = await context.codeFor(started.value.secret);
    await confirmMfaEnrollment(ACTOR.id, code, context.deps);
    expect(await verifySecondFactor(ACTOR.id, code, context.deps)).toMatchObject({ reason: "invalidCode" });
  });

  it("refuses a wrong code", async () => {
    const { deps } = await enrolled();
    expect(await verifySecondFactor(ACTOR.id, "000000", deps)).toMatchObject({ ok: false, reason: "invalidCode" });
  });

  it("spends a recovery code, typed in any case and with or without dashes, exactly once", async () => {
    const { deps, recoveryCodes } = await enrolled();
    const code = recoveryCodes[0] ?? "";
    expect(await verifySecondFactor(ACTOR.id, code.toLowerCase().replace(/-/g, " "), deps)).toEqual({ ok: true, value: "recovery_code" });
    expect(await verifySecondFactor(ACTOR.id, code, deps)).toMatchObject({ reason: "invalidCode" });
    expect((await mfaStatus(ACTOR.id, deps)).recoveryCodesLeft).toBe(RECOVERY_CODE_COUNT - 1);
  });

  it("says notEnabled for someone without MFA", async () => {
    const { deps } = await setup();
    expect(await verifySecondFactor(ACTOR.id, "123456", deps)).toMatchObject({ reason: "notEnabled" });
  });

  it("fails closed, never open, when the key is missing or no longer opens the secret", async () => {
    const { store, runtime, codeFor, secret } = await enrolled();
    const code = await codeFor(secret);
    const missing: StaffMfaDependencies = { store, key: null, runtime, issuer: "x" };
    expect(await verifySecondFactor(ACTOR.id, code, missing)).toMatchObject({ reason: "unavailable" });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rotated: StaffMfaDependencies = { store, key: await deriveSecretBoxKey("rotated", "staff-totp-v1"), runtime, issuer: "x" };
    expect(await verifySecondFactor(ACTOR.id, code, rotated)).toMatchObject({ reason: "unavailable" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("staff_mfa.secret_unreadable"));
  });
});

describe("turning off and replacing codes", () => {
  it("disables only with a valid second factor", async () => {
    const { deps, codeFor, secret } = await enrolled();
    expect(await disableMfa(ACTOR.id, "000000", deps)).toMatchObject({ reason: "invalidCode" });
    expect(await isMfaEnabled(ACTOR.id, deps)).toBe(true);
    expect(await disableMfa(ACTOR.id, await codeFor(secret), deps)).toEqual({ ok: true, value: "totp" });
    expect(await mfaStatus(ACTOR.id, deps)).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
  });

  it("regenerates codes: the old ones stop working, the new ones work", async () => {
    const { deps, codeFor, secret, recoveryCodes } = await enrolled();
    const replaced = await regenerateRecoveryCodes(ACTOR.id, await codeFor(secret), deps);
    if (!replaced.ok) throw new Error(replaced.reason);
    expect(await verifySecondFactor(ACTOR.id, recoveryCodes[0] ?? "", deps)).toMatchObject({ reason: "invalidCode" });
    expect(await verifySecondFactor(ACTOR.id, replaced.value.recoveryCodes[0] ?? "", deps)).toEqual({ ok: true, value: "recovery_code" });
  });

  it("lets an owner reset someone's MFA entirely", async () => {
    const { deps } = await enrolled();
    await resetMfa(ACTOR.id, deps);
    expect(await mfaStatus(ACTOR.id, deps)).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
  });
});

describe("normalizeRecoveryCode", () => {
  it("treats six digits as a TOTP code and anything else as a recovery code", () => {
    expect(normalizeRecoveryCode("123 456")).toBeNull();
    expect(normalizeRecoveryCode("abcd-efgh ijkl-mnop")).toBe("ABCDEFGHIJKLMNOP");
  });
});
