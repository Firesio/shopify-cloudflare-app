import { CloudflareNotificationQueue } from "~/adapters/notification-queue.server";
import { audienceTextFor } from "~/wiring/audience.server";
import type { AudienceTextFor } from "~/i18n/audience";
import { notify } from "~/notifications/notify.server";
import type { ImmediateNotifier, Notifier } from "~/ports/notifier";
import type { PushTransport } from "~/ports/push-transport";
import { pushTransport } from "~/wiring/push.server";
import { getEnv } from "~/request-context.server";
import { availableChannels } from "~/notifications/eligibility/snapshot.server";
import { appRuntime } from "~/wiring/runtime.server";
import { createQueuedNotifier } from "~/services/notification-enqueue";
import type { NotificationConsumerDependencies } from "~/services/notification-queue";
import { NotificationLogRepo } from "~/models/notification-logs.server";
import { NotificationSettingsRepo } from "~/models/notification-settings.server";
import type { NotificationLogsPort } from "~/ports/notification-logs";
import type { NotificationSettingsPort } from "~/ports/notification-settings";
import type { Runtime } from "~/ports/runtime";
import type { ChannelKey } from "~/notifications/types";

export function notificationLogs(): NotificationLogsPort { return new NotificationLogRepo(); }
export function notificationSettings(): NotificationSettingsPort { return new NotificationSettingsRepo(); }
export function notificationDependencies(): {
  readonly logs: NotificationLogsPort;
  readonly settings: NotificationSettingsPort;
  readonly runtime: Pick<Runtime, "clock" | "ids">;
  readonly availableChannels: readonly ChannelKey[];
  readonly push?: PushTransport;
  readonly audienceTextFor: AudienceTextFor;
} {
  const push = pushTransport();
  return {
    logs: notificationLogs(),
    settings: notificationSettings(),
    runtime: appRuntime(),
    availableChannels: availableChannels(getEnv(), { push: push !== undefined }),
    audienceTextFor,
    ...(push ? { push } : {}),
  };
}

/** The `Notifier` use cases receive: enqueues, never sends inline. */
export function queuedNotifier(): Notifier {
  return createQueuedNotifier({
    queue: new CloudflareNotificationQueue(getEnv().NOTIFICATION_QUEUE),
    logs: notificationLogs(),
    newId: () => appRuntime().ids.uuid(),
    now: () => appRuntime().clock.now(),
    log: (entry) => console.error(JSON.stringify(entry)),
  });
}

/** What the queue consumer runs per message: the one `notify()` entry point. */
export function notificationConsumerDependencies(): NotificationConsumerDependencies {
  return {
    send: (request) => notify(request, notificationDependencies()),
    log: (entry) => console[entry.event === "notification.queue_sent" ? "log" : "warn"](JSON.stringify(entry)),
  };
}

/**
 * Sends inside the request and counts what was accepted, through the same `notify()` as the queue consumer. A retriable
 * failure surfaces from `notify()` as a throw so a queue can back off; here nobody retries, so any failure is logged
 * and counted as not delivered.
 */
export function immediateNotifier(): ImmediateNotifier {
  return {
    async sendNow(input) {
      const dedupeKey = input.dedupeKey ?? `${input.event}:${appRuntime().ids.uuid()}`;
      try {
        const result = await notify({ ...input, dedupeKey }, notificationDependencies());
        return { delivered: result.dispatched.filter((entry) => !entry.skipped && entry.outcome.status === "sent").length };
      } catch (cause) {
        console.warn(JSON.stringify({
          event: "notification.send_now_failed",
          notification: input.event,
          reason: cause instanceof Error ? cause.name : "unknown",
        }));
        return { delivered: 0 };
      }
    },
  };
}
