import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { AdminUserRepo } from "./admin-users.server";
import { PushSubscriptionRepo } from "./push-subscriptions.server";
import { StaffPreferenceRepo, StaffRecipientsRepo } from "./staff-notifications.server";
import { adminNotificationPreferences } from "~/db/schema";
import { getDb } from "~/request-context.server";
import { STAFF_TOPICS, STAFF_TOPIC_SPECS, type StaffChannel, type StaffTopic } from "~/domain/staff-notification-topics";
// The legacy-flag data migration, as shipped.
import legacyMuteMigration from "../../drizzle/0030_staff_notification_legacy_mute.sql?raw";

setupTestDatabase();

const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const NOW = 1_700_000_000_000;

async function admin(id: string, over: { status?: "active" | "disabled"; at?: number } = {}) {
  const users = new AdminUserRepo();
  await users.create({ id, email: `${id}@workmanjsc.vn`, name: `Name ${id}`, passwordHash: "x", role: "admin", now: over.at ?? NOW });
  if (over.status === "disabled") await users.setStatus(id, "disabled", NOW);
}

async function device(adminId: string, id: string, enabled = true) {
  const repo = new PushSubscriptionRepo();
  await repo.upsert(adminId, { id, endpoint: `https://fcm.googleapis.com/${id}`, p256dh: "k", auth: "a", label: "Chrome on Android", kind: "phone", now: NOW });
  if (!enabled) await repo.setEnabled(adminId, id, false);
}

function defaultFor(topic: StaffTopic, channel: StaffChannel): boolean {
  return STAFF_TOPIC_SPECS[topic].defaults[channel];
}

describe("StaffPreferenceRepo", () => {
  it("is empty until a choice is stored", async () => {
    await run(async () => {
      await admin("a");
      expect(await new StaffPreferenceRepo().list("a")).toEqual([]);
    });
  });

  it("stores a choice, and a second write replaces it rather than adding a row", async () => {
    await run(async () => {
      await admin("a");
      const repo = new StaffPreferenceRepo();
      await repo.set("a", "shop_installed", "email", true, NOW);
      await repo.set("a", "shop_installed", "email", false, NOW + 1);
      await repo.set("a", "shop_installed", "push", false, NOW);
      expect(await repo.list("a")).toEqual(
        expect.arrayContaining([
          { topic: "shop_installed", channel: "email", enabled: false },
          { topic: "shop_installed", channel: "push", enabled: false },
        ]),
      );
      expect(await repo.list("a")).toHaveLength(2);
    });
  });

  it("ignores a stored row for a topic or channel the catalogue no longer has", async () => {
    await run(async () => {
      await admin("a");
      await getDb().insert(adminNotificationPreferences).values([
        { adminUserId: "a", topic: "retired_topic", channel: "email", enabled: true, updatedAt: NOW },
        { adminUserId: "a", topic: "shop_installed", channel: "sms", enabled: true, updatedAt: NOW },
        { adminUserId: "a", topic: "shop_installed", channel: "push", enabled: false, updatedAt: NOW },
      ]);
      expect(await new StaffPreferenceRepo().list("a")).toEqual([{ topic: "shop_installed", channel: "push", enabled: false }]);
    });
  });

  it("another admin cannot read or change a person's choices", async () => {
    await run(async () => {
      await admin("a");
      await admin("b");
      const repo = new StaffPreferenceRepo();
      await repo.set("a", "shop_installed", "push", false, NOW);
      expect(await repo.list("b")).toEqual([]);
      await repo.set("b", "shop_installed", "push", true, NOW);
      expect(await repo.list("a")).toEqual([{ topic: "shop_installed", channel: "push", enabled: false }]);
      expect(await repo.list("b")).toEqual([{ topic: "shop_installed", channel: "push", enabled: true }]);
    });
  });

  it("deleting an admin deletes their choices", async () => {
    await run(async () => {
      await admin("a");
      await new StaffPreferenceRepo().set("a", "shop_installed", "push", false, NOW);
      await new AdminUserRepo().remove("a");
      expect(await getDb().select().from(adminNotificationPreferences)).toEqual([]);
    });
  });
});

describe("StaffRecipientsRepo.recipientsFor", () => {
  it("uses each topic's default when nobody has chosen", async () => {
    await run(async () => {
      await admin("a");
      await device("a", "d1");
      for (const topic of STAFF_TOPICS) {
        const result = await new StaffRecipientsRepo().recipientsFor(topic);
        expect(result.emails.map((row) => row.adminId)).toEqual(defaultFor(topic, "email") ? ["a"] : []);
        expect(result.devices.map((row) => row.subscriptionId)).toEqual(defaultFor(topic, "push") ? ["d1"] : []);
      }
    });
  });

  it("returns the address and name of an email recipient", async () => {
    await run(async () => {
      await admin("a");
      const result = await new StaffRecipientsRepo().recipientsFor("support_ticket_opened");
      expect(result.emails).toEqual([{ adminId: "a", name: "Name a", email: "a@workmanjsc.vn" }]);
    });
  });

  it("a stored false overrides a default true, for email and for push", async () => {
    await run(async () => {
      await admin("a");
      await admin("b");
      await device("a", "da");
      await device("b", "db");
      const prefs = new StaffPreferenceRepo();
      await prefs.set("a", "support_ticket_opened", "email", false, NOW);
      await prefs.set("b", "support_ticket_opened", "push", false, NOW);
      const result = await new StaffRecipientsRepo().recipientsFor("support_ticket_opened");
      expect(result.emails.map((row) => row.adminId)).toEqual(["b"]);
      expect(result.devices.map((row) => row.subscriptionId)).toEqual(["da"]);
    });
  });

  it("a stored true overrides a default false, for email only where asked", async () => {
    await run(async () => {
      await admin("a");
      await admin("b");
      await device("a", "da");
      await new StaffPreferenceRepo().set("a", "shop_installed", "email", true, NOW);
      const result = await new StaffRecipientsRepo().recipientsFor("shop_installed");
      expect(result.emails.map((row) => row.adminId)).toEqual(["a"]);
      // push defaults on for shop_installed, so the device is still included
      expect(result.devices.map((row) => row.subscriptionId)).toEqual(["da"]);
    });
  });

  it("a choice for one topic does not leak into another", async () => {
    await run(async () => {
      await admin("a");
      await new StaffPreferenceRepo().set("a", "support_ticket_reply", "email", false, NOW);
      const result = await new StaffRecipientsRepo().recipientsFor("support_ticket_opened");
      expect(result.emails.map((row) => row.adminId)).toEqual(["a"]);
    });
  });

  it("excludes a disabled admin: no email, no devices", async () => {
    await run(async () => {
      await admin("a", { status: "disabled" });
      await admin("b");
      await device("a", "da");
      await device("b", "db");
      const result = await new StaffRecipientsRepo().recipientsFor("support_ticket_opened");
      expect(result.emails.map((row) => row.adminId)).toEqual(["b"]);
      expect(result.devices.map((row) => row.subscriptionId)).toEqual(["db"]);
    });
  });

  it("excludes a disabled device but keeps the person's other devices", async () => {
    await run(async () => {
      await admin("a");
      await device("a", "off", false);
      await device("a", "on");
      const result = await new StaffRecipientsRepo().recipientsFor("shop_uninstalled");
      expect(result.devices.map((row) => row.subscriptionId)).toEqual(["on"]);
    });
  });

  it("returns every enabled device of a person who has push on, and none of one who has it off", async () => {
    await run(async () => {
      await admin("a");
      await admin("b");
      await device("a", "a1");
      await device("a", "a2");
      await device("b", "b1");
      await new StaffPreferenceRepo().set("b", "shop_installed", "push", false, NOW);
      const result = await new StaffRecipientsRepo().recipientsFor("shop_installed");
      expect(result.devices.map((row) => row.subscriptionId).sort()).toEqual(["a1", "a2"]);
      expect(result.devices.every((row) => row.adminId === "a")).toBe(true);
    });
  });

  it("is empty when there is no staff at all", async () => {
    await run(async () => {
      expect(await new StaffRecipientsRepo().recipientsFor("shop_installed")).toEqual({ emails: [], devices: [] });
    });
  });

  it("scales past the D1 bound-parameter limit without a per-person query", async () => {
    await run(async () => {
      const users = new AdminUserRepo();
      for (let i = 0; i < 130; i += 1) {
        await users.create({ id: `u${i}`, email: `u${i}@workmanjsc.vn`, name: `U${i}`, passwordHash: "x", role: "admin", now: NOW + i });
      }
      await device("u0", "d0");
      await device("u129", "d129");
      const result = await new StaffRecipientsRepo().recipientsFor("support_ticket_opened");
      expect(result.emails).toHaveLength(130);
      expect(result.devices.map((row) => row.subscriptionId).sort()).toEqual(["d0", "d129"]);
    });
  });
});

describe("legacy notify_support migration", () => {
  /** Puts an account in the state the old "Email me about tickets" switch left it in. Nothing in the app writes this column any more. */
  async function muteLegacy(id: string): Promise<void> {
    await env.DB.prepare("UPDATE admin_users SET notify_support = 0 WHERE id = ?").bind(id).run();
  }

  /** Runs the migration's SQL on one line: D1's exec splits statements on newlines. */
  async function applyMigration(): Promise<void> {
    const statement = legacyMuteMigration
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    await env.DB.exec(statement);
  }

  it("turns off support email for accounts that had muted tickets, and only for them", async () => {
    await run(async () => {
      await admin("muted");
      await admin("subscribed");
      await muteLegacy("muted");
      await applyMigration();

      const prefs = new StaffPreferenceRepo();
      expect(await prefs.list("muted")).toEqual(
        expect.arrayContaining([
          { topic: "support_ticket_opened", channel: "email", enabled: false },
          { topic: "support_ticket_reply", channel: "email", enabled: false },
        ]),
      );
      expect(await prefs.list("muted")).toHaveLength(2);
      expect(await prefs.list("subscribed")).toEqual([]);

      const opened = await new StaffRecipientsRepo().recipientsFor("support_ticket_opened");
      expect(opened.emails.map((row) => row.adminId)).toEqual(["subscribed"]);
      // Shop topics are untouched, and push is untouched.
      const installed = await new StaffRecipientsRepo().recipientsFor("shop_installed");
      expect(installed.emails).toEqual([]);
    });
  });

  it("leaves a choice the person already stored alone, and is safe to run twice", async () => {
    await run(async () => {
      await admin("muted");
      await muteLegacy("muted");
      await new StaffPreferenceRepo().set("muted", "support_ticket_opened", "email", true, NOW);
      await applyMigration();
      await applyMigration();
      const prefs = await new StaffPreferenceRepo().list("muted");
      expect(prefs).toHaveLength(2);
      expect(prefs).toContainEqual({ topic: "support_ticket_opened", channel: "email", enabled: true });
      expect(prefs).toContainEqual({ topic: "support_ticket_reply", channel: "email", enabled: false });
    });
  });
});
