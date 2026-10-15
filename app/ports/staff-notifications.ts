import type { StaffChannel, StaffPreference, StaffTopic } from "~/domain/staff-notification-topics";

export interface StaffEmailRecipient {
  readonly adminId: string;
  readonly name: string;
  readonly email: string;
}

export interface StaffPushDevice {
  readonly subscriptionId: string;
  readonly adminId: string;
}

export interface StaffRecipients {
  readonly emails: readonly StaffEmailRecipient[];
  readonly devices: readonly StaffPushDevice[];
}

/**
 * Who should hear about a topic, decided by each person's own settings: active
 * staff only, an email for each who has the topic on by email, and every ENABLED
 * device of each who has it on by push.
 */
export interface StaffNotificationRecipients {
  recipientsFor(topic: StaffTopic): Promise<StaffRecipients>;
}

/** One person's stored choices. Absent rows mean "the topic's default". */
export interface StaffPreferenceStore {
  list(adminUserId: string): Promise<readonly StaffPreference[]>;
  set(adminUserId: string, topic: StaffTopic, channel: StaffChannel, enabled: boolean, now: number): Promise<void>;
}
