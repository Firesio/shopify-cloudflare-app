import { MEMBER_PERMISSIONS, rolesHolding, type MemberPermission, type MemberRole } from "~/domain/member-access";
import type { MemberStatus } from "~/domain/member-lifecycle";
import type { CreateOutcome, Member, MemberProfile, MemberStore, NewMember, SeatCap } from "~/ports/members";

/**
 * An in-memory `MemberStore` that keeps the real store's promises: one membership per (shop, Shopify user), a first
 * member added only while nobody has opened the app, an invitation taken up once. Use cases are tested against it with no D1.
 *
 * `beforeWrite` runs just before a write lands, so a test can play "another request got there first" by adding the
 * competing row at exactly that moment.
 */
export class FakeMemberStore implements MemberStore {
  readonly rows: Member[] = [];
  readonly writes: string[] = [];
  beforeWrite: ((kind: string) => void) | undefined;

  /** Seeds a row directly, as a fixture. */
  add(member: Partial<Member> & Pick<Member, "shop" | "id" | "role" | "status">): Member {
    const full: Member = {
      shopifyUserId: null,
      email: null,
      name: null,
      accountOwner: false,
      collaborator: false,
      invitedBy: null,
      createdAt: 1,
      updatedAt: 1,
      lastSeenAt: null,
      trimmedAt: null,
      permissions: null,
      ...member,
    };
    this.rows.push(full);
    return full;
  }

  private write(kind: string): void {
    this.writes.push(kind);
    this.beforeWrite?.(kind);
  }

  private replace(id: string, change: Partial<Member>): Member | undefined {
    const index = this.rows.findIndex((row) => row.id === id);
    const current = this.rows[index];
    if (current === undefined) return undefined;
    const next = { ...current, ...change };
    this.rows[index] = next;
    return next;
  }

  async findByUserId(shop: string, shopifyUserId: string) {
    return this.rows.find((row) => row.shop === shop && row.shopifyUserId === shopifyUserId);
  }

  async findInviteByEmail(shop: string, email: string) {
    return this.rows.find((row) => row.shop === shop && row.status === "invited" && row.shopifyUserId === null && row.email === email.trim().toLowerCase());
  }

  async findOpenByEmail(shop: string, email: string) {
    return this.rows.find((row) => row.shop === shop && row.status !== "removed" && row.email === email.trim().toLowerCase());
  }

  async hasOpenedApp(shop: string) {
    return this.rows.some((row) => row.shop === shop && row.shopifyUserId !== null);
  }

  async createFirstMemberIfNone(shop: string, member: Omit<NewMember, "status">) {
    this.write("createFirstMemberIfNone");
    if (await this.hasOpenedApp(shop)) return undefined;
    return this.insert(shop, { ...member, status: "active" });
  }

  async create(shop: string, member: NewMember, cap: SeatCap): Promise<CreateOutcome> {
    this.write("create");
    const inserted = this.insert(shop, { ...member, status: this.statusFor(shop, member.status, cap) });
    return inserted === undefined ? { kind: "exists" } : { kind: "created", member: inserted };
  }

  private activeCount(shop: string): number {
    return this.rows.filter((row) => row.shop === shop && row.status === "active").length;
  }

  private hasSeat(shop: string, cap: SeatCap): boolean {
    return cap === null || this.activeCount(shop) < cap;
  }

  private statusFor(shop: string, wanted: "active" | "pending", cap: SeatCap): "active" | "pending" {
    return wanted === "active" && this.hasSeat(shop, cap) ? "active" : "pending";
  }

  private insert(shop: string, member: NewMember): Member | undefined {
    if (this.rows.some((row) => row.shop === shop && row.shopifyUserId === member.shopifyUserId)) return undefined;
    return this.add({
      id: member.id,
      shop,
      shopifyUserId: member.shopifyUserId,
      email: member.email === null ? null : member.email.toLowerCase(),
      name: member.name,
      role: member.role,
      status: member.status,
      accountOwner: member.accountOwner,
      collaborator: member.collaborator,
      createdAt: member.now,
      updatedAt: member.now,
      lastSeenAt: member.now,
    });
  }

  async createInvite(shop: string, invite: { id: string; email: string; role: MemberRole; invitedBy: string; now: number }) {
    return this.add({ id: invite.id, shop, email: invite.email.trim().toLowerCase(), role: invite.role, status: "invited", invitedBy: invite.invitedBy, createdAt: invite.now, updatedAt: invite.now });
  }

  async acceptInvite(shop: string, inviteId: string, link: { shopifyUserId: string; profile: MemberProfile; now: number }, cap: SeatCap) {
    this.write("acceptInvite");
    const invite = this.rows.find((row) => row.shop === shop && row.id === inviteId && row.status === "invited" && row.shopifyUserId === null);
    if (invite === undefined) return undefined;
    if (this.rows.some((row) => row.shop === shop && row.shopifyUserId === link.shopifyUserId)) return undefined;
    return this.replace(invite.id, {
      shopifyUserId: link.shopifyUserId,
      status: this.statusFor(shop, "active", cap),
      email: link.profile.email ?? invite.email,
      name: link.profile.name ?? invite.name,
      accountOwner: link.profile.accountOwner,
      collaborator: link.profile.collaborator,
      updatedAt: link.now,
      lastSeenAt: link.now,
    });
  }

  async restoreOwner(shop: string, id: string, profile: MemberProfile, now: number) {
    this.write("restoreOwner");
    if (!this.rows.some((row) => row.shop === shop && row.id === id)) return undefined;
    const current = this.rows.find((row) => row.id === id);
    return this.replace(id, {
      role: "owner",
      status: "active",
      trimmedAt: null,
      permissions: null,
      email: profile.email ?? current?.email ?? null,
      name: profile.name ?? current?.name ?? null,
      accountOwner: profile.accountOwner,
      collaborator: profile.collaborator,
      updatedAt: now,
      lastSeenAt: now,
    });
  }

  async findById(shop: string, id: string) {
    return this.rows.find((row) => row.shop === shop && row.id === id);
  }

  async list(shop: string) {
    return this.rows.filter((row) => row.shop === shop);
  }

  async listWithRoles(shop: string, roles: readonly MemberRole[], limit: number) {
    return this.rows.filter((row) => row.shop === shop && row.status === "active" && roles.includes(row.role) && row.permissions === null).slice(0, limit);
  }

  async listActive(shop: string) {
    return this.rows.filter((row) => row.shop === shop && row.status === "active");
  }

  async listShopsWithSeveralActive(afterShop: string | null, limit: number) {
    const counts = new Map<string, number>();
    for (const row of this.rows) if (row.status === "active") counts.set(row.shop, (counts.get(row.shop) ?? 0) + 1);
    return [...counts].filter(([shop, n]) => n > 1 && (afterShop === null || shop > afterShop)).map(([shop]) => shop).sort().slice(0, limit);
  }

  async countByStatus(shop: string) {
    const counts: Record<MemberStatus, number> = { invited: 0, pending: 0, active: 0, removed: 0 };
    for (const row of this.rows) if (row.shop === shop) counts[row.status] += 1;
    return counts;
  }

  async activate(shop: string, id: string, input: { from: readonly MemberStatus[]; role: MemberRole; cap: SeatCap; now: number }) {
    this.write("activate");
    const target = this.rows.find((row) => row.shop === shop && row.id === id);
    if (target === undefined || !input.from.includes(target.status) || !this.hasSeat(shop, input.cap)) return undefined;
    return this.replace(id, { status: "active", role: input.role, trimmedAt: null, permissions: null, updatedAt: input.now });
  }

  /** The member is the shop's last active owner: changing them would leave it with none. */
  private isLastOwner(target: Member): boolean {
    return target.role === "owner" && target.status === "active" && this.rows.filter((row) => row.shop === target.shop && row.role === "owner" && row.status === "active").length <= 1;
  }

  /** A manager is an active member on a manager role's preset: someone with a set of their own is never one. */
  private isManager(row: Member): boolean {
    return row.status === "active" && row.permissions === null && rolesHolding("members:manage").includes(row.role);
  }

  /** The member is the shop's last active team manager: changing them out of managing would leave it with none. */
  private isLastManager(target: Member): boolean {
    return this.isManager(target) && this.rows.filter((row) => row.shop === target.shop && this.isManager(row)).length <= 1;
  }

  async setRole(shop: string, id: string, role: MemberRole, now: number) {
    this.write("setRole");
    const target = this.rows.find((row) => row.shop === shop && row.id === id);
    if (target === undefined) return undefined;
    if (role !== "owner" && this.isLastOwner(target)) return undefined;
    if (!rolesHolding("members:manage").includes(role) && this.isLastManager(target)) return undefined;
    return this.replace(id, { role, permissions: null, updatedAt: now });
  }

  async setPermissions(shop: string, id: string, permissions: readonly MemberPermission[], now: number, role?: MemberRole) {
    this.write("setPermissions");
    const target = this.rows.find((row) => row.shop === shop && row.id === id);
    if (target === undefined || target.status !== "active" || target.role === "owner" || target.accountOwner || this.isLastManager(target)) return undefined;
    return this.replace(id, { permissions: MEMBER_PERMISSIONS.filter((permission) => permissions.includes(permission)), ...(role === undefined ? {} : { role }), updatedAt: now });
  }

  async remove(shop: string, id: string, now: number) {
    this.write("remove");
    const target = this.rows.find((row) => row.shop === shop && row.id === id);
    if (target === undefined || target.status === "removed" || this.isLastOwner(target) || this.isLastManager(target)) return undefined;
    return this.replace(id, { status: "removed", trimmedAt: null, permissions: null, updatedAt: now });
  }

  async trim(shop: string, id: string, limit: number, now: number) {
    this.write("trim");
    const target = this.rows.find((row) => row.shop === shop && row.id === id);
    if (target === undefined || target.status !== "active" || target.role === "owner" || target.accountOwner || this.isLastManager(target) || this.activeCount(shop) <= limit) return undefined;
    return this.replace(id, { status: "pending", trimmedAt: now, updatedAt: now });
  }

  async recordSeen(shop: string, id: string, profile: MemberProfile, now: number) {
    this.write("recordSeen");
    const current = this.rows.find((row) => row.shop === shop && row.id === id);
    if (current === undefined) return;
    this.replace(id, {
      email: profile.email ?? current.email,
      name: profile.name ?? current.name,
      accountOwner: profile.accountOwner,
      collaborator: profile.collaborator,
      lastSeenAt: now,
    });
  }
}
