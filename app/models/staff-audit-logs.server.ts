import { desc } from "drizzle-orm";
import { staffAuditLogs } from "~/db/schema";
import type { StaffAuditEntry, StaffAuditLog } from "~/ports/staff-audit";
import { getDb } from "~/request-context.server";

/**
 * The only place `staff_audit_logs` is written or read. Not shop-scoped: it is
 * a trail of OUR staff across every shop. Its `shop` column exists so the
 * tenant purge erases a redacted shop's rows; expiry is the retention sweep.
 */
export class StaffAuditLogRepo implements StaffAuditLog {
  async record(entry: StaffAuditEntry): Promise<void> {
    await getDb().insert(staffAuditLogs).values({
      id: entry.id,
      adminUserId: entry.adminUserId,
      actorEmail: entry.actorEmail,
      kind: entry.kind,
      method: entry.method,
      path: entry.path,
      shop: entry.shop,
      createdAt: entry.at,
    });
  }

  async recent(limit: number): Promise<readonly StaffAuditEntry[]> {
    const rows = await getDb()
      .select()
      .from(staffAuditLogs)
      .orderBy(desc(staffAuditLogs.createdAt), desc(staffAuditLogs.id))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      adminUserId: row.adminUserId,
      actorEmail: row.actorEmail,
      kind: row.kind,
      method: row.method,
      path: row.path,
      shop: row.shop,
      at: row.createdAt,
    }));
  }
}
