export type DeviceKind = "phone" | "tablet" | "desktop";

/** A browser/device a staff member registered to receive push. */
export interface PushSubscriptionRecord {
  readonly id: string;
  readonly adminUserId: string;
  /** The push service URL. A capability: whoever holds it can send to the device, so it is never shown or logged. */
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  /** "Chrome on Android" — derived from the user agent when registering. */
  readonly label: string;
  readonly kind: DeviceKind;
  /** The person can switch one device off without losing the registration. */
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
}

export interface NewPushSubscription {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly label: string;
  readonly kind: DeviceKind;
  readonly now: number;
}

/**
 * Every method that takes an admin id is scoped to it: another admin's device can
 * be neither read, changed nor removed through this port.
 */
export interface PushSubscriptionStore {
  listForAdmin(adminUserId: string): Promise<readonly PushSubscriptionRecord[]>;
  countForAdmin(adminUserId: string): Promise<number>;
  /**
   * Registers the device. The endpoint is unique: registering one that already
   * exists (the same browser subscribing again, or a handed-over device) moves
   * it to this admin and refreshes its keys instead of duplicating it.
   */
  upsert(adminUserId: string, input: NewPushSubscription): Promise<void>;
  setEnabled(adminUserId: string, id: string, enabled: boolean): Promise<boolean>;
  remove(adminUserId: string, id: string): Promise<boolean>;
  /** The sender's lookup. Not admin-scoped: the queue message carries only the id. */
  findById(id: string): Promise<PushSubscriptionRecord | undefined>;
  /** The system dropping a device the push service says is gone. */
  removeById(id: string): Promise<void>;
  markUsed(id: string, now: number): Promise<void>;
}
