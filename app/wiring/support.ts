import { resolveContent } from "@firesio/content";
import type { Notifier } from "@firesio/notify";
import type { NotificationCatalogue } from "@firesio/notify";
import {
  SupportContactService,
  SupportInboxService,
  SupportService,
  SupportTriageService,
  plainReplyAddressing,
  signAttachmentToken,
  supportMailDomain,
  type CustomerMail,
  type StaffAlert,
  type TriageCandidate,
  type SupportNotifier,
  type SupportUrls,
} from "@firesio/support";
import { D1SupportInboundRepo, D1SupportRepo, D1SupportTriageRepo } from "@firesio/support/d1";
import type { AiService } from "@firesio/ai";
import { drizzle } from "drizzle-orm/d1";
import type { Blocklist } from "~/core/blocklist";
import { r2Attachments } from "~/adapters/r2-attachments";
import { withinLimit } from "~/adapters/rate-limit";
import { turnstile } from "~/adapters/turnstile";
import { CONTENT, FALLBACK_LOCALE, TRANSLATIONS } from "~/core/content";
import { identity } from "~/core/identity";
import type { NotificationType } from "~/core/notifications";
import { spamTriageTask } from "~/core/support/spam";
import { jsonLog, type Runtime } from "./runtime";

export const supportUrls = (appUrl: string): SupportUrls => ({
  merchantThread: (id) => `${appUrl}/app/support/${id}`,
  // The staff answer in the portal (docs/architecture.md section 7), which opens the thread through the AdminApi support group.
  staffThread: (id) => `${appUrl}/app/support/${id}`,
  file: (id, token) => `/support/file/${id}?token=${token}`,
});

function customerMailBuilder(env: Env, mail: CustomerMail) {
  const rendered = resolveContent(CONTENT, "mail.support_reply", {
    locale: mail.locale ?? FALLBACK_LOCALE,
    fallbackLocale: FALLBACK_LOCALE,
    translations: TRANSLATIONS,
    vars: { staffName: mail.staffName, subject: mail.subject, excerpt: mail.excerpt, ticketUrl: mail.threadUrl ?? env.SHOPIFY_APP_URL, appName: identity.name },
  });
  if (!rendered.ok || env.EMAIL_FROM === "") return null;
  const { subject, body } = rendered.value.parts;
  return {
    to: mail.to,
    from: mail.from ?? env.EMAIL_FROM,
    subject: subject?.text ?? mail.subject,
    html: body?.html ?? "",
    text: body?.text ?? "",
    ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
    headers: { ...mail.threadHeaders },
  };
}

/**
 * Who hears what: staff activity goes through `@firesio/notify` to `STAFF_ALERT_EMAIL` (staff routing belongs to the portal;
 * an empty value reports `skipped:no_address`). A customer reply is ONE message addressed and threaded by the library, so it
 * goes straight to the `EMAIL` binding: `notify`'s email channel has a fixed From, Reply-To and header set, not one per ticket.
 */
export function supportNotifier(env: Env, notifier: Pick<Notifier<string, NotificationCatalogue>, "send">, blocklist: Blocklist): SupportNotifier {
  return {
    async alertStaff(alert: StaffAlert) {
      await notifier.send("", "support.merchant_activity" satisfies NotificationType, {
        to: { email: env.STAFF_ALERT_EMAIL },
        vars: { shopName: alert.shopName, subject: alert.subject, excerpt: alert.excerpt, ticketUrl: alert.threadUrl },
      });
    },
    async mailCustomer(mail: CustomerMail) {
      // The portal's blocklist (scam mail): a blocked recipient or shop gets nothing, and an unreadable blocklist holds the mail back.
      if (await blocklist.mailBlocked(mail.shop ?? "", mail.to)) {
        jsonLog({ event: "support.notify_customer_failed", reason: "blocked" });
        return;
      }
      const builder = customerMailBuilder(env, mail);
      if (builder === null) return;
      await env.EMAIL.send(builder);
    },
  };
}

export interface SupportDeps {
  readonly notifier: SupportNotifier;
  readonly ai: Pick<AiService, "runDecision">;
}

/** The ambient pieces every support service takes. */
function commonOf(env: Env, runtime: Runtime) {
  const mailDomain = supportMailDomain(env.SHOPIFY_APP_URL, env.SUPPORT_MAIL_DOMAIN);
  return {
    db: drizzle(env.DB),
    ids: { uuid: runtime.uuid },
    clock: { now: runtime.now },
    addressing: mailDomain === null ? null : plainReplyAddressing(mailDomain),
    urls: supportUrls(env.SHOPIFY_APP_URL),
    log: jsonLog,
  };
}

/** The spam probability of a stranger's mail, or `null` (no answer opens the conversation: a real customer's mail is never lost to a model being down). */
function spamScorer(ai: SupportDeps["ai"]) {
  return async (candidate: TriageCandidate): Promise<number | null> => {
    const result = await ai.runDecision(spamTriageTask, candidate, { surface: "system", shop: null });
    if (!result.ok) jsonLog({ event: "support.spam_check_unavailable", reason: result.reason });
    return result.ok ? result.value : null;
  };
}

/** The three support services over the library's D1 repos. The shop directory answers from the `shops` table. */
export function supportServices(env: Env, runtime: Runtime, deps: SupportDeps) {
  const common = commonOf(env, runtime);
  const { db, ids, clock, addressing, urls, log } = common;
  const triageRepo = new D1SupportTriageRepo(db, ids);
  const reviewUrl = env.SHOPIFY_APP_HANDLE === "" ? null : `https://apps.shopify.com/${env.SHOPIFY_APP_HANDLE}#modal-show=ReviewListingModal`;
  const support = new SupportService({
    repo: new D1SupportRepo(db, ids),
    store: r2Attachments(env.UPLOADS),
    notifier: deps.notifier,
    addressing,
    clock,
    ids,
    urls,
    reviewUrl,
    withinRateLimit: withinLimit(env.SUPPORT_LIMITER),
    signAttachment: (attachmentId, expiresAt) => signAttachmentToken({ secret: env.ATTACHMENT_TOKEN_SECRET, attachmentId, expiresAt }),
    log,
  });
  const triage = new SupportTriageService({ blocked: triageRepo, withinRateLimit: withinLimit(env.SUPPORT_MAIL_LIMITER), scoreSpam: spamScorer(deps.ai) });
  const inbox = new SupportInboxService({ repo: new D1SupportInboundRepo(db, ids), triage, quarantine: triageRepo, shops: { find: (domain) => findShop(env.DB, domain) }, notifier: deps.notifier, urls, clock, ids, addressing, log });
  const contact = new SupportContactService({ inbox, botCheck: turnstile(env.TURNSTILE_SECRET_KEY ?? "", fetch), withinRateLimit: withinLimit(env.SUPPORT_FORM_LIMITER) });
  return { support, inbox, contact };
}

async function findShop(db: D1Database, domain: string) {
  const row = await db.prepare(`SELECT shop, name FROM shops WHERE shop = ?1`).bind(domain).first();
  const shop = row?.["shop"];
  if (typeof shop !== "string") return null;
  const name = row?.["name"];
  return { shop, name: typeof name === "string" ? name : shop };
}
