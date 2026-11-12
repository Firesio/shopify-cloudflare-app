import { WorkersAiGenerator, workersAiModelFactory } from "~/adapters/workers-ai.server";
import { appReviewUrl } from "~/lib/install-target";
import { WorkersAiDecider, workersAiRunner } from "~/adapters/workers-ai-decider.server";
import { composeGates, type AiGate } from "~/ai/gate";
import { dailyCallCap } from "~/ai/quota-gate";
import type { TextGenerator } from "~/ports/ai";
import type { Decider } from "~/ports/ai-decision";
import { getEnv } from "~/request-context.server";
import { AiService } from "~/services/ai.server";
import { SupportService } from "~/services/support.server";
import { signAttachmentToken } from "~/support/file-token";
import { supportMailDomain } from "~/support/inbound/mail-domain";
import { SupportInboxService } from "~/services/support-inbox.server";
import { scoreSpam } from "~/services/support-spam-check.server";
import { SupportTriageService } from "~/services/support-triage.server";
import { SupportContactService } from "~/services/support-contact.server";
import { noBotCheck, turnstileBotCheck } from "~/adapters/bot-check.server";
import { queuedNotifier } from "~/wiring/notifications.server";
import { aiRepository, shops, support, supportInbound, supportTriage } from "~/wiring/repositories.server";
import { appRuntime } from "~/wiring/runtime.server";
import { staffNotificationRecipients } from "~/wiring/staff-notifications.server";

export function requireAttachmentTokenSecret(env: { readonly ATTACHMENT_TOKEN_SECRET?: string; readonly SHOPIFY_API_SECRET?: string }): string {
  if (!env.ATTACHMENT_TOKEN_SECRET) {
    throw new Error("ATTACHMENT_TOKEN_SECRET is not configured");
  }
  return env.ATTACHMENT_TOKEN_SECRET;
}

/**
 * THE COMPOSITION ROOT — the one place a port is bound to an adapter.
 *
 * It exists because @rules/core.md forbids ring 3 importing ring 4: a
 * use case declares a port and RECEIVES an implementation, it never names one.
 * `AiService` used to import the Workers AI adapter directly, which quietly made
 * the service impossible to run against anything else and dragged the provider
 * into every test that touched it.
 *
 * Everything an app is likely to change about AI is a line in this file:
 *
 *   - a different provider            → swap `aiGenerator`
 *   - a gating policy                 → `composeGates(...)` into `aiGate`
 *   - AI switched off entirely        → a generator that always refuses
 *
 * Built per REQUEST, not at module load: bindings arrive on the request `env`,
 * and a module-level instance would be shared across shops in a reused isolate
 * (@rules/core.md — no mutable module state).
 */

/** The text generator every AI use case runs on. */
export function aiGenerator(): TextGenerator {
  return new WorkersAiGenerator({ languageModel: workersAiModelFactory() });
}

/** The decision models every decision purpose runs on: a different kind of model, so a different port. */
export function aiDecider(timeoutMs?: number): Decider {
  return new WorkersAiDecider({ run: workersAiRunner(), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
}

export function aiService(): AiService {
  return new AiService({ repo: aiRepository(), generator: aiGenerator(), decider: aiDecider(), clock: appRuntime().clock, ids: appRuntime().ids, gate: aiGate() });
}

export function supportService(): SupportService {
  const env = getEnv();
  return new SupportService({
    repo: support(),
    staff: staffNotificationRecipients(),
    clock: appRuntime().clock,
    notifier: queuedNotifier(),
    appUrl: env.SHOPIFY_APP_URL,
    reviewUrl: appReviewUrl(env.SHOPIFY_APP_HANDLE),
    mailDomain: supportMailDomain(env.SHOPIFY_APP_URL, env.SUPPORT_MAIL_DOMAIN),
    withinRateLimit: async (shop) => env.SUPPORT_LIMITER ? (await env.SUPPORT_LIMITER.limit({ key: shop })).success : true,
    signAttachment: async (attachmentId, expiresAt) => signAttachmentToken({ secret: requireAttachmentTokenSecret(env), attachmentId, expiresAt }),
    log: (entry) => console.error(JSON.stringify(entry)),
  });
}

/**
 * How many decision calls may run per rolling day. The only caller today is the inbound-mail spam check,
 * which runs once per stranger's mail: far above real traffic, far below a flood paid for in tokens.
 */
const DECISION_CALLS_PER_DAY = 500;

/**
 * Who may use AI.
 *
 * No plan policy in the base: that is the app's decision, not the base's. The one rule that ships is a spend cap on
 * `decision`, because that purpose is driven by traffic we do not control. An app adds its own by naming more
 * gates in `composeGates(...)` (see `~/ai/gate`); this is the ONLY file that has to change.
 */
export function aiGate(): AiGate {
  return composeGates(
    dailyCallCap({
      role: "decision",
      perDay: DECISION_CALLS_PER_DAY,
      callsSince: (role, since) => aiRepository().callsSince(role, since),
      now: appRuntime().clock.now,
    }),
  );
}

/** Longer than a draft would be allowed, shorter than a mail handler can wait: a slow check must cost the check, not the mail. */
const SPAM_CHECK_TIMEOUT_MS = 4_000;

/** The same AI service as everywhere, except that this caller cannot wait half a minute for a model. */
function spamCheckAiService(): AiService {
  const generator = new WorkersAiGenerator({ languageModel: workersAiModelFactory(), timeoutMs: SPAM_CHECK_TIMEOUT_MS });
  return new AiService({ repo: aiRepository(), generator, decider: aiDecider(SPAM_CHECK_TIMEOUT_MS), clock: appRuntime().clock, ids: appRuntime().ids, gate: aiGate() });
}

/** What happens to a stranger's first mail: blocklist, per-sender limit, then the model. */
export function supportTriageService(): SupportTriageService {
  const env = getEnv();
  return new SupportTriageService({
    blocked: supportTriage(),
    withinRateLimit: async (senderEmail) =>
      env.SUPPORT_MAIL_LIMITER ? (await env.SUPPORT_MAIL_LIMITER.limit({ key: senderEmail })).success : true,
    scoreSpam: (candidate) =>
      scoreSpam({ ai: spamCheckAiService(), log: (entry) => console.error(JSON.stringify(entry)) }, candidate),
  });
}

/** Mail that reaches support, from anyone: puts it in its thread or opens one. */
export function supportInboxService(): SupportInboxService {
  const env = getEnv();
  return new SupportInboxService({
    repo: supportInbound(),
    triage: supportTriageService(),
    quarantine: supportTriage(),
    shops: {
      find: async (shopDomain) => {
        const shop = await shops().get(shopDomain);
        return shop ? { shop: shop.shop, name: shop.name ?? shopDomain } : null;
      },
    },
    clock: appRuntime().clock,
    ids: appRuntime().ids,
    staff: staffNotificationRecipients(),
    notifier: queuedNotifier(),
    appUrl: env.SHOPIFY_APP_URL,
    mailDomain: supportMailDomain(env.SHOPIFY_APP_URL, env.SUPPORT_MAIL_DOMAIN),
    log: (entry) => console.error(JSON.stringify(entry)),
  });
}

/**
 * The public support form. The check is Turnstile when a site key is set; with
 * none (local development) nothing is asked. A site key without its secret
 * refuses every submission rather than quietly skipping the check.
 */
export function supportContactService(): SupportContactService {
  const env = getEnv();
  return new SupportContactService({
    withinRateLimit: async (clientKey) =>
      env.SUPPORT_FORM_LIMITER ? (await env.SUPPORT_FORM_LIMITER.limit({ key: clientKey })).success : true,
    botCheck: env.TURNSTILE_SITE_KEY === "" ? noBotCheck : turnstileBotCheck({ secret: env.TURNSTILE_SECRET_KEY ?? "" }),
    inbox: supportInboxService(),
  });
}
