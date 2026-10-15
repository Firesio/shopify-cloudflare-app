/**
 * What a staff member can be notified about, and the channel it can arrive on.
 *
 * A TOPIC is what the person sees in settings ("New support ticket"); it is not
 * the same thing as a notification EVENT (what the system emits). One event can
 * serve two topics (`support_merchant_activity` is a new ticket OR a reply), and
 * the person chooses by topic. A person's choice is one on/off per
 * (topic, channel); a missing choice falls back to the topic's default, so a new
 * topic ships with a sensible behaviour and nobody has to be migrated.
 *
 * Pure: no I/O, no clock, no environment.
 */
export const STAFF_TOPICS = [
  "support_ticket_opened",
  "support_ticket_reply",
  "shop_installed",
  "shop_uninstalled",
] as const;
export type StaffTopic = (typeof STAFF_TOPICS)[number];

/** Where a staff notification can arrive. Push goes to the person's registered devices. */
export const STAFF_CHANNELS = ["email", "push"] as const;
export type StaffChannel = (typeof STAFF_CHANNELS)[number];

export type StaffTopicGroup = "support" | "shops";

export interface StaffTopicSpec {
  readonly group: StaffTopicGroup;
  readonly label: string;
  readonly description: string;
  /** Used until the person chooses. Support stays on by email, as `notify_support` defaulted to. */
  readonly defaults: Readonly<Record<StaffChannel, boolean>>;
}

/** Keyed by the topic union, so adding a topic fails the build until it is described. */
export const STAFF_TOPIC_SPECS: Readonly<Record<StaffTopic, StaffTopicSpec>> = {
  support_ticket_opened: {
    group: "support",
    label: "New support ticket",
    description: "A merchant opens a ticket.",
    defaults: { email: true, push: true },
  },
  support_ticket_reply: {
    group: "support",
    label: "Merchant reply",
    description: "A merchant replies to an existing ticket.",
    defaults: { email: true, push: true },
  },
  shop_installed: {
    group: "shops",
    label: "New install",
    description: "A shop installs the app, or installs it again after uninstalling.",
    defaults: { email: false, push: true },
  },
  shop_uninstalled: {
    group: "shops",
    label: "Uninstall",
    description: "A shop uninstalls the app.",
    defaults: { email: false, push: true },
  },
};

export const STAFF_TOPIC_GROUP_LABEL: Readonly<Record<StaffTopicGroup, string>> = {
  support: "Support",
  shops: "Shops",
};

export function isStaffTopic(value: string): value is StaffTopic {
  return STAFF_TOPICS.some((topic) => topic === value);
}

export function isStaffChannel(value: string): value is StaffChannel {
  return STAFF_CHANNELS.some((channel) => channel === value);
}

/** One stored choice. */
export interface StaffPreference {
  readonly topic: StaffTopic;
  readonly channel: StaffChannel;
  readonly enabled: boolean;
}

/** The stored choice if there is one, otherwise the topic's default. */
export function isEnabled(
  preferences: readonly StaffPreference[],
  topic: StaffTopic,
  channel: StaffChannel,
): boolean {
  const stored = preferences.find((row) => row.topic === topic && row.channel === channel);
  return stored?.enabled ?? STAFF_TOPIC_SPECS[topic].defaults[channel];
}

export interface StaffMatrixRow {
  readonly topic: StaffTopic;
  readonly group: StaffTopicGroup;
  readonly label: string;
  readonly description: string;
  readonly email: boolean;
  readonly push: boolean;
}

/** Every topic with its effective setting per channel, in catalogue order, for the settings page. */
export function buildMatrix(preferences: readonly StaffPreference[]): readonly StaffMatrixRow[] {
  return STAFF_TOPICS.map((topic) => {
    const spec = STAFF_TOPIC_SPECS[topic];
    return {
      topic,
      group: spec.group,
      label: spec.label,
      description: spec.description,
      email: isEnabled(preferences, topic, "email"),
      push: isEnabled(preferences, topic, "push"),
    };
  });
}
