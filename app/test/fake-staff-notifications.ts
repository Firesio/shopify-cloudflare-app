import { isEnabled, type StaffPreference } from "~/domain/staff-notification-topics";
import type { NewPushSubscription, PushSubscriptionRecord, PushSubscriptionStore } from "~/ports/push-subscriptions";
import type { StaffPreferenceStore } from "~/ports/staff-notifications";

/** In-memory `PushSubscriptionStore` with the same admin scoping and endpoint-move behaviour as the real one. */
export class FakePushSubscriptions implements PushSubscriptionStore {
  readonly rows: PushSubscriptionRecord[] = [];
  private replace(next: PushSubscriptionRecord): void {
    const index = this.rows.findIndex((row) => row.id === next.id);
    if (index === -1) this.rows.push(next);
    else this.rows[index] = next;
  }
  async listForAdmin(adminUserId: string) {
    return this.rows.filter((row) => row.adminUserId === adminUserId);
  }
  async countForAdmin(adminUserId: string) {
    return this.rows.filter((row) => row.adminUserId === adminUserId).length;
  }
  async upsert(adminUserId: string, input: NewPushSubscription) {
    const existing = this.rows.find((row) => row.endpoint === input.endpoint);
    this.replace({
      id: existing?.id ?? input.id,
      adminUserId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label: input.label,
      kind: input.kind,
      enabled: true,
      createdAt: input.now,
      lastUsedAt: null,
    });
  }
  async setEnabled(adminUserId: string, id: string, enabled: boolean) {
    const row = this.rows.find((candidate) => candidate.id === id && candidate.adminUserId === adminUserId);
    if (!row) return false;
    this.replace({ ...row, enabled });
    return true;
  }
  async remove(adminUserId: string, id: string) {
    const index = this.rows.findIndex((row) => row.id === id && row.adminUserId === adminUserId);
    if (index === -1) return false;
    this.rows.splice(index, 1);
    return true;
  }
  async findById(id: string) {
    return this.rows.find((row) => row.id === id);
  }
  async removeById(id: string) {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index !== -1) this.rows.splice(index, 1);
  }
  async markUsed(id: string, now: number) {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) this.replace({ ...row, lastUsedAt: now });
  }
}

/** In-memory `StaffPreferenceStore`, scoped per admin. */
export class FakeStaffPreferences implements StaffPreferenceStore {
  private readonly byAdmin = new Map<string, StaffPreference[]>();
  async list(adminUserId: string) {
    return this.byAdmin.get(adminUserId) ?? [];
  }
  async set(adminUserId: string, topic: StaffPreference["topic"], channel: StaffPreference["channel"], enabled: boolean) {
    const others = (this.byAdmin.get(adminUserId) ?? []).filter((row) => !(row.topic === topic && row.channel === channel));
    this.byAdmin.set(adminUserId, [...others, { topic, channel, enabled }]);
  }
  has(adminUserId: string, topic: StaffPreference["topic"], channel: StaffPreference["channel"]): boolean {
    return isEnabled(this.byAdmin.get(adminUserId) ?? [], topic, channel);
  }
}
