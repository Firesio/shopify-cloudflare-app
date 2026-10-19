import type { StaffAuditKind } from "~/domain/staff-audit";

export interface StaffAuditEntry {
  readonly id: string;
  /** Null only when the account no longer exists. */
  readonly adminUserId: string | null;
  readonly actorEmail: string;
  readonly kind: StaffAuditKind;
  readonly method: string | null;
  readonly path: string | null;
  readonly shop: string | null;
  readonly at: number;
}

/** Append-only trail of staff access to the internal console. */
export interface StaffAuditLog {
  record(entry: StaffAuditEntry): Promise<void>;
  /** Newest first, for the console's own audit view. */
  recent(limit: number): Promise<readonly StaffAuditEntry[]>;
}
