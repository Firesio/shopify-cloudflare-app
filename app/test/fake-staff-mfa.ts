import type { StaffMfaState, StaffMfaStore } from "~/ports/staff-mfa";

/** In-memory `StaffMfaStore` with the same conditional-write rules as the D1 repo. */
export function fakeStaffMfaStore(): StaffMfaStore & { readonly codes: Map<string, { adminUserId: string; usedAt: number | null }> } {
  const states = new Map<string, StaffMfaState>();
  const codes = new Map<string, { adminUserId: string; usedAt: number | null }>();
  const empty: StaffMfaState = { secret: null, pendingSecret: null, pendingCreatedAt: null, enabledAt: null, lastStep: null };
  const replace = (adminUserId: string, hashes: readonly string[]) => {
    for (const [hash, code] of codes) if (code.adminUserId === adminUserId) codes.delete(hash);
    for (const hash of hashes) codes.set(hash, { adminUserId, usedAt: null });
  };
  return {
    codes,
    async find(id) {
      return states.get(id);
    },
    async savePending(id, sealed, now) {
      states.set(id, { ...(states.get(id) ?? empty), pendingSecret: sealed, pendingCreatedAt: now });
    },
    async confirm(id, expected, step, hashes, now) {
      const state = states.get(id);
      if (!state || state.pendingSecret !== expected) return false;
      states.set(id, { secret: expected, pendingSecret: null, pendingCreatedAt: null, enabledAt: now, lastStep: step });
      replace(id, hashes);
      return true;
    },
    async claimStep(id, step) {
      const state = states.get(id);
      if (!state || (state.lastStep !== null && state.lastStep >= step)) return false;
      states.set(id, { ...state, lastStep: step });
      return true;
    },
    async useRecoveryCode(id, hash, now) {
      const code = codes.get(hash);
      if (!code || code.adminUserId !== id || code.usedAt !== null) return false;
      code.usedAt = now;
      return true;
    },
    async replaceRecoveryCodes(id, hashes) {
      replace(id, hashes);
    },
    async countUnusedRecoveryCodes(id) {
      return [...codes.values()].filter((code) => code.adminUserId === id && code.usedAt === null).length;
    },
    async remove(id) {
      states.delete(id);
      replace(id, []);
    },
  };
}
