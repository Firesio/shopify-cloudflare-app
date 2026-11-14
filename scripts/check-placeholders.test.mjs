import assert from "node:assert/strict";
import { test } from "node:test";
import { launchWarnings, validateLaunchContract } from "./check-placeholders.mjs";

function validFiles() {
  const production = {
    kv_namespaces: [
      { binding: "SESSION", id: "0123456789abcdef0123456789abcdef" },
      { binding: "PORTAL_BLOCKLIST", id: "fedcba9876543210fedcba9876543210" },
    ],
    d1_databases: [{ binding: "DB", database_id: "11111111-2222-3333-4444-555555555555" }],
    vars: {
      SHOPIFY_API_KEY: "client-key",
      SHOPIFY_APP_URL: "https://app.example.org",
      PARTNER_APP_ID: "123456",
      PARTNER_ORG_ID: "1234567",
      EVENT_HASH_KEY_ID: "firesio-1",
      AI_GATEWAY_ID: "",
      TURNSTILE_SITE_KEY: "0x4AAAAAAAexample",
    },
    secrets: { required: ["PARTNER_API_TOKEN", "ATTACHMENT_TOKEN_SECRET", "EVENT_HASH_SECRET"] },
    r2_buckets: [{ binding: "UPLOADS", bucket_name: "uploads" }],
    send_email: [{ name: "EMAIL" }],
    ai: { binding: "AI" },
    queues: {
      producers: [{ binding: "WEBHOOK_QUEUE", queue: "queue" }, { binding: "PORTAL_EVENTS", queue: "portal-events-prod" }],
      consumers: [{ queue: "queue", max_retries: 5, dead_letter_queue: "queue-dlq" }],
    },
    ratelimits: [{ name: "SUPPORT_LIMITER" }, { name: "SUPPORT_FORM_LIMITER" }, { name: "SUPPORT_MAIL_LIMITER" }],
    triggers: { crons: ["30 3 * * *", "* * * * *"] },
  };
  return {
    wrangler: { ...structuredClone(production), env: { production } },
    productionToml: 'client_id = "client-key"\napplication_url = "https://app.example.org"\n[webhooks]\napi_version = "2026-10"\n[access_scopes]\nscopes = ""\n[auth]\nredirect_urls = [ "https://app.example.org/auth/callback" ]',
    developmentToml: 'client_id = "dev-key"\napplication_url = "https://dev.example.org"\n[webhooks]\napi_version = "2026-10"\n[access_scopes]\nscopes = ""\n[auth]\nredirect_urls = [ "https://dev.example.org/auth/callback" ]',
    legal: 'export const x = "Our policy";',
    identity: 'slug: "useful-app", name: "Useful App", companyName: "Example LLC", supportEmail: "support@example.org", address: "1 Main Street", effectiveDate: "2026-09-01"',
    plans: 'name: "Free"\nname: "Pro"',
    publicCopy: "Clear support. Email support@example.org.",
    routeSources: [{ path: "app/routes/app/home.tsx", source: "export default function Home() { return null; }" }],
  };
}

test("accepts populated production config while allowing local fixture values", () => {
  assert.deepEqual(validateLaunchContract(validFiles()), []);
});

test("refuses a plan table, public page or home page that is still template copy", () => {
  const plans = validateLaunchContract({ ...validFiles(), plans: 'name: "TODO:FREE"' });
  assert.match(plans[0], /plans\.ts still has placeholder/);
  const pages = validateLaunchContract({ ...validFiles(), publicCopy: "TODO: what your app does" });
  assert.match(pages[0], /public pages/);
  const home = validateLaunchContract({ ...validFiles(), routeSources: [{ path: "app/routes/app/home.tsx", source: "<p>TODO: replace</p>" }] });
  assert.match(home[0], /app\/routes\/app\/home\.tsx is still the template's placeholder page/);
});

test("requires both the drain cron and the daily cron in production", () => {
  const noDrain = validFiles();
  noDrain.wrangler.env.production.triggers = { crons: ["30 3 * * *"] };
  assert.match(validateLaunchContract(noDrain).join("\n"), /drain cron/);
  const noDaily = validFiles();
  noDaily.wrangler.env.production.triggers = { crons: ["* * * * *"] };
  assert.match(validateLaunchContract(noDaily).join("\n"), /daily cron/);
});

test("reports an absent production binding by its exact key", () => {
  const files = validFiles();
  files.wrangler.env.production.queues.producers = [{ binding: "WEBHOOK_QUEUE", queue: "queue" }];
  assert.ok(validateLaunchContract(files).includes("production binding PORTAL_EVENTS is missing"));
});

test("rejects a top-level var omitted from production, and a missing secret", () => {
  const files = validFiles();
  files.wrangler.vars = { ...files.wrangler.vars, STAFF_ALERT_EMAIL: "" };
  assert.ok(validateLaunchContract(files).includes("production var STAFF_ALERT_EMAIL is missing"));
  const secret = validFiles();
  secret.wrangler.env.production.secrets = { required: ["PARTNER_API_TOKEN", "ATTACHMENT_TOKEN_SECRET"] };
  assert.ok(validateLaunchContract(secret).includes("EVENT_HASH_SECRET secret is not declared"));
});

test("rejects production config without a webhook queue consumer", () => {
  const files = validFiles();
  files.wrangler.env.production.queues.consumers = [];
  assert.ok(validateLaunchContract(files).some((issue) => /consumer/.test(issue)));
});

test("rejects every launch placeholder and redirect drift", () => {
  const files = validFiles();
  files.wrangler.env.production.vars.PARTNER_ORG_ID = "";
  files.wrangler.env.production.vars.EVENT_HASH_KEY_ID = "REPLACE_ME";
  files.productionToml = files.productionToml.replace("https://app.example.org/auth/callback", "https://elsewhere.example.org/auth/callback");
  const issues = validateLaunchContract(files);
  assert.ok(issues.includes("PARTNER_ORG_ID is missing or placeholder"));
  assert.ok(issues.includes("EVENT_HASH_KEY_ID is missing or placeholder"));
  assert.ok(issues.includes("shopify.app.toml redirect_urls drift from application_url"));
});

test("rejects placeholders in the dedicated identity source and an impossible policy date", () => {
  assert.ok(validateLaunchContract({ ...validFiles(), identity: 'slug: "my-app", name: "TODO: Your App Name", companyName: "Firesio", supportEmail: "a@b.org", address: "x", effectiveDate: "2026-09-01"' }).some((issue) => /identity/.test(issue)));
  assert.ok(validateLaunchContract({ ...validFiles(), identity: validFiles().identity.replace("2026-09-01", "2026-02-31") }).some((issue) => /effective date/.test(issue)));
});

test("rejects a webhook API version that is not the template release, and a production app URL that is not https", () => {
  const files = validFiles();
  files.productionToml = files.productionToml.replace("2026-10", "2026-04");
  assert.ok(validateLaunchContract(files).some((issue) => /webhook API version/.test(issue)));
  const http = validFiles();
  http.wrangler.env.production.vars.SHOPIFY_APP_URL = "http://app.example.org";
  assert.ok(validateLaunchContract(http).includes("SHOPIFY_APP_URL must be an https:// URL"));
});

test("does not require production to re-declare the local-only TURNSTILE_SECRET_KEY slot", () => {
  const files = validFiles();
  files.wrangler.vars = { ...files.wrangler.vars, TURNSTILE_SECRET_KEY: "" };
  assert.deepEqual(validateLaunchContract(files), []);
});

test("warns, without blocking, when the support form has no bot check configured or the App Store handle is empty", () => {
  const files = validFiles();
  files.wrangler.env.production.vars.TURNSTILE_SITE_KEY = "";
  files.wrangler.env.production.vars.SHOPIFY_APP_HANDLE = "";
  const warnings = launchWarnings(files);
  assert.ok(warnings.some((warning) => /TURNSTILE_SITE_KEY/.test(warning)));
  assert.ok(warnings.some((warning) => /SHOPIFY_APP_HANDLE is empty/.test(warning)));
  assert.deepEqual(validateLaunchContract(files).filter((issue) => /TURNSTILE|HANDLE/.test(issue)), []);
});
