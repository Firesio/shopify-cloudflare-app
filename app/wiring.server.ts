/**
 * THE COMPOSITION ROOT FACADE — callers import from here; the bindings live in
 * `app/wiring/`, one module per concern:
 *
 *   runtime                    clock / ids / random bytes, and the env context
 *   repositories               D1 repositories behind their ports
 *   entitlement-cache          advisory KV cache for entitlement previews
 *   entitlement-reconciliation held-usage reconciliation port
 *   admin                      staff session, users, auth limiters, reset tokens
 *   shop-identity              shop identity and time zone
 *   billing                    subscriptions, entitlements, Partner refresh
 *   ai-support                 AI and support use cases
 *   notifications              queued notifier and consumer dependencies
 *   staff-notifications        staff devices, per-person preferences, who hears about a topic
 *   push                       Web Push sender and the public VAPID key
 *   webhooks                   webhook consumer, tenant purge, scheduled work
 */
export { appContext, appRuntime } from "~/wiring/runtime.server";
export {
  type AiRepositoryPort,
  type OperationalHealthPort,
  type ShopifyEventsPort,
  type ShopsPort,
  type ShopSubscriptionsPort,
  type ShopSyncCheckpointsPort,
  type SupportPort,
  type WebhookDeliveryRepositoryPort,
  type WebhookScopeObservationsPort,
  aiRepository,
  mcpAuditLogs,
  mcpOAuth,
  mcpTokens,
  operationalHealth,
  planGrants,
  shopifyEvents,
  shopMetrics,
  shops,
  shopSubscriptions,
  shopSyncCheckpoints,
  support,
  webhookDeliveries,
  webhookDeliveryRepository,
  webhookScopeObservations,
} from "~/wiring/repositories.server";
export { entitlementCache, entitlementCachePort, invalidateEntitlements } from "~/wiring/entitlement-cache.server";
export { entitlementReconciliationPort } from "~/wiring/entitlement-reconciliation.server";
export {
  adminSessionStorage,
  adminSessionUsers,
  adminUsers,
  authLimiters,
  passwordResetNotifier,
  passwordResetTokens,
  staffAudit,
  staffMfa,
} from "~/wiring/admin.server";
export { persistShopIdentity, shopTimeZone } from "~/wiring/shop-identity.server";
export {
  entitlements,
  historyLedger,
  refreshShopHistory,
  refreshShopSubscription,
  subscriptionsPort,
} from "~/wiring/billing.server";
export {
  aiGate,
  aiGenerator,
  aiService,
  requireAttachmentTokenSecret,
  supportContactService,
  supportInboxService,
  supportService,
} from "~/wiring/ai-support.server";
export { redactionGuard } from "~/wiring/redaction.server";
export { scheduledDependencies, tenantPurgeDependencies, webhookConsumer, webhookQueueDependencies } from "~/wiring/webhooks.server";
export { pushConfig, pushSender } from "~/wiring/push.server";
export { shopChangeAnnouncer } from "~/wiring/shop-announcements.server";
export {
  pushSubscriptionStore,
  staffNotificationRecipients,
  staffNotificationSettings,
  staffPreferenceStore,
} from "~/wiring/staff-notifications.server";
