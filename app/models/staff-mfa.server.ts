import { and, count, eq, isNull, lt, or } from "drizzle-orm";
import { adminMfa, adminRecoveryCodes } from "~/db/schema";
import type { StaffMfaState, StaffMfaStore } from "~/ports/staff-mfa";
import { getDb } from "~/request-context.server";

/**
 * The only place `admin_mfa` and `admin_recovery_codes` are queried. Staff
 * records, not shop-scoped (see `admin_users`). Every single-use rule is a
 * conditional write, so two concurrent requests can never both spend one code.
 */
export class StaffMfaRepo implements StaffMfaStore {
  async find(adminUserId: string): Promise<StaffMfaState | undefined> {
    const rows = await getDb().select().from(adminMfa).where(eq(adminMfa.adminUserId, adminUserId)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      secret: row.secret,
      pendingSecret: row.pendingSecret,
      pendingCreatedAt: row.pendingCreatedAt,
      enabledAt: row.enabledAt,
      lastStep: row.lastStep,
    };
  }

  async savePending(adminUserId: string, sealedSecret: string, now: number): Promise<void> {
    await getDb()
      .insert(adminMfa)
      .values({ adminUserId, pendingSecret: sealedSecret, pendingCreatedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: adminMfa.adminUserId,
        set: { pendingSecret: sealedSecret, pendingCreatedAt: now, updatedAt: now },
      });
  }

  async confirm(
    adminUserId: string,
    expectedPending: string,
    step: number,
    recoveryCodeHashes: readonly string[],
    now: number,
  ): Promise<boolean> {
    const db = getDb();
    const codes = recoveryCodeHashes.map((codeHash) => ({ codeHash, adminUserId, createdAt: now }));
    // Two steps, not one transaction: the promotion is guarded on the pending secret, and the codes are replaced only
    // when it applied. If the second step fails, MFA is on with the previous codes (none, on first setup); the
    // staff member regenerates them from their profile. Nothing is ever left half-enabled.
    const promoted = await db
      .update(adminMfa)
      .set({ secret: expectedPending, pendingSecret: null, pendingCreatedAt: null, enabledAt: now, lastStep: step, updatedAt: now })
      .where(and(eq(adminMfa.adminUserId, adminUserId), eq(adminMfa.pendingSecret, expectedPending)));
    if (promoted.meta.changes === 0) return false;
    await this.replaceCodes(adminUserId, codes);
    return true;
  }

  async claimStep(adminUserId: string, step: number, now: number): Promise<boolean> {
    const result = await getDb()
      .update(adminMfa)
      .set({ lastStep: step, updatedAt: now })
      .where(and(eq(adminMfa.adminUserId, adminUserId), or(isNull(adminMfa.lastStep), lt(adminMfa.lastStep, step))));
    return result.meta.changes === 1;
  }

  async useRecoveryCode(adminUserId: string, codeHash: string, now: number): Promise<boolean> {
    const result = await getDb()
      .update(adminRecoveryCodes)
      .set({ usedAt: now })
      .where(and(
        eq(adminRecoveryCodes.codeHash, codeHash),
        eq(adminRecoveryCodes.adminUserId, adminUserId),
        isNull(adminRecoveryCodes.usedAt),
      ));
    return result.meta.changes === 1;
  }

  async replaceRecoveryCodes(adminUserId: string, codeHashes: readonly string[], now: number): Promise<void> {
    await this.replaceCodes(adminUserId, codeHashes.map((codeHash) => ({ codeHash, adminUserId, createdAt: now })));
  }

  async countUnusedRecoveryCodes(adminUserId: string): Promise<number> {
    const rows = await getDb()
      .select({ unused: count() })
      .from(adminRecoveryCodes)
      .where(and(eq(adminRecoveryCodes.adminUserId, adminUserId), isNull(adminRecoveryCodes.usedAt)));
    return rows[0]?.unused ?? 0;
  }

  async remove(adminUserId: string): Promise<void> {
    const db = getDb();
    await db.batch([
      db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, adminUserId)),
      db.delete(adminMfa).where(eq(adminMfa.adminUserId, adminUserId)),
    ]);
  }

  private async replaceCodes(
    adminUserId: string,
    codes: readonly { codeHash: string; adminUserId: string; createdAt: number }[],
  ): Promise<void> {
    const db = getDb();
    const deleteOld = db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, adminUserId));
    if (codes.length === 0) {
      await deleteOld;
      return;
    }
    await db.batch([deleteOld, db.insert(adminRecoveryCodes).values([...codes])]);
  }
}
