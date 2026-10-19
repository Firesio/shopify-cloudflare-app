/** A staff member's second-factor state, with secrets still SEALED (app/lib/secret-box.ts). */
export interface StaffMfaState {
  readonly secret: string | null;
  readonly pendingSecret: string | null;
  readonly pendingCreatedAt: number | null;
  readonly enabledAt: number | null;
  readonly lastStep: number | null;
}

export interface StaffMfaStore {
  find(adminUserId: string): Promise<StaffMfaState | undefined>;
  /** Start (or restart) enrollment. Never touches a confirmed secret. */
  savePending(adminUserId: string, sealedSecret: string, now: number): Promise<void>;
  /**
   * Turn the pending secret on, record the step that confirmed it, then replace
   * the recovery codes. False, with nothing changed, when the pending secret is
   * no longer `expectedPending` (enrollment restarted in another tab).
   */
  confirm(adminUserId: string, expectedPending: string, step: number, recoveryCodeHashes: readonly string[], now: number): Promise<boolean>;
  /** Accept `step` only if it is newer than the stored one; atomic, so one code works once. */
  claimStep(adminUserId: string, step: number, now: number): Promise<boolean>;
  /** Spend an unused recovery code; atomic, so one code works once. */
  useRecoveryCode(adminUserId: string, codeHash: string, now: number): Promise<boolean>;
  replaceRecoveryCodes(adminUserId: string, codeHashes: readonly string[], now: number): Promise<void>;
  countUnusedRecoveryCodes(adminUserId: string): Promise<number>;
  /** Turn MFA off: the secret, any pending setup, and every recovery code. */
  remove(adminUserId: string): Promise<void>;
}
