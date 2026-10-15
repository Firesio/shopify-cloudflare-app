import { and, eq } from "drizzle-orm";
import { adminNotificationPreferences, adminUsers, pushSubscriptions } from "~/db/schema";
import {
  isEnabled,
  isStaffChannel,
  isStaffTopic,
  type StaffChannel,
  type StaffPreference,
  type StaffTopic,
} from "~/domain/staff-notification-topics";
import type {
  StaffEmailRecipient,
  StaffNotificationRecipients,
  StaffPreferenceStore,
  StaffPushDevice,
  StaffRecipients,
} from "~/ports/staff-notifications";
import { getDb } from "~/request-context.server";

/**
 * The ONLY place `admin_notification_preferences` is queried. Every read and
 * write is filtered on the admin, so nobody reads or writes another person's
 * choices through it.
 */
export class StaffPreferenceRepo implements StaffPreferenceStore {
  async list(adminUserId: string): Promise<readonly StaffPreference[]> {
    const rows = await getDb()
      .select()
      .from(adminNotificationPreferences)
      .where(eq(adminNotificationPreferences.adminUserId, adminUserId));
    return rows.flatMap((row) =>
      // Stored values outlive the code that wrote them: a row naming a retired
      // topic or channel is dropped, not cast into a type it no longer has.
      isStaffTopic(row.topic) && isStaffChannel(row.channel)
        ? [{ topic: row.topic, channel: row.channel, enabled: row.enabled }]
        : [],
    );
  }

  async set(adminUserId: string, topic: StaffTopic, channel: StaffChannel, enabled: boolean, now: number): Promise<void> {
    await getDb()
      .insert(adminNotificationPreferences)
      .values({ adminUserId, topic, channel, enabled, updatedAt: now })
      .onConflictDoUpdate({
        target: [
          adminNotificationPreferences.adminUserId,
          adminNotificationPreferences.topic,
          adminNotificationPreferences.channel,
        ],
        set: { enabled, updatedAt: now },
      });
  }
}

interface AdminChoices {
  readonly adminId: string;
  readonly name: string;
  readonly email: string;
  readonly preferences: StaffPreference[];
}

/**
 * Who hears about a topic. Two queries however many people there are, and no
 * `IN (...)` list (D1 caps bound parameters at 100): the people with their own
 * stored choices for the topic, then the enabled devices of active staff. The
 * decision itself is the pure `isEnabled`, so a stored choice overrides the
 * topic's default in both directions.
 */
export class StaffRecipientsRepo implements StaffNotificationRecipients {
  async recipientsFor(topic: StaffTopic): Promise<StaffRecipients> {
    const db = getDb();
    const [choices, devices] = await Promise.all([
      db
        .select({
          adminId: adminUsers.id,
          name: adminUsers.name,
          email: adminUsers.email,
          topic: adminNotificationPreferences.topic,
          channel: adminNotificationPreferences.channel,
          enabled: adminNotificationPreferences.enabled,
        })
        .from(adminUsers)
        .leftJoin(
          adminNotificationPreferences,
          and(eq(adminNotificationPreferences.adminUserId, adminUsers.id), eq(adminNotificationPreferences.topic, topic)),
        )
        .where(eq(adminUsers.status, "active"))
        .orderBy(adminUsers.createdAt, adminUsers.id),
      db
        .select({ subscriptionId: pushSubscriptions.id, adminId: pushSubscriptions.adminUserId })
        .from(pushSubscriptions)
        .innerJoin(adminUsers, eq(adminUsers.id, pushSubscriptions.adminUserId))
        .where(and(eq(adminUsers.status, "active"), eq(pushSubscriptions.enabled, true)))
        .orderBy(pushSubscriptions.createdAt, pushSubscriptions.id),
    ]);

    const admins = new Map<string, AdminChoices>();
    for (const row of choices) {
      const admin = admins.get(row.adminId) ?? { adminId: row.adminId, name: row.name, email: row.email, preferences: [] };
      if (row.channel !== null && row.topic !== null && row.enabled !== null && isStaffTopic(row.topic) && isStaffChannel(row.channel)) {
        admin.preferences.push({ topic: row.topic, channel: row.channel, enabled: row.enabled });
      }
      admins.set(row.adminId, admin);
    }

    const emails: StaffEmailRecipient[] = [];
    for (const admin of admins.values()) {
      if (isEnabled(admin.preferences, topic, "email")) emails.push({ adminId: admin.adminId, name: admin.name, email: admin.email });
    }
    const pushDevices: StaffPushDevice[] = devices.filter((device) => {
      const admin = admins.get(device.adminId);
      return admin !== undefined && isEnabled(admin.preferences, topic, "push");
    });
    return { emails, devices: pushDevices };
  }
}
