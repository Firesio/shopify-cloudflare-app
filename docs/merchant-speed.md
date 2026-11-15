# Keeping the embedded admin fast

How the merchant side (`/app/**`) is kept fast, the rules that keep it that way, and how to measure it. Verified Shopify and
Cloudflare facts are in [`shopify-api-invariants.md`](shopify-api-invariants.md); the rule file agents load is
[`merchant-speed.md`](../.claude/rules/merchant-speed.md).

## What the merchant waits for

A document load of `/app/...` runs, in this order:

1. Cloudflare serves the HTML shell from the Worker (cold isolate: the whole server bundle is parsed first).
2. `firesio.adminMiddleware` runs `authenticate.admin`, which verifies the session token. Once an hour per shop the stored access token
   expires and the library **mints a new one (token exchange) and awaits `afterAuth`** (the preset's: it awaits the redaction fence and the install
   record, and hands the rest to `waitUntil`): that request pays for what `afterAuth` awaits.
3. The layout loader (`app/routes/app/layout.tsx`) and the page loader run in parallel. The page waits for the slower one.
4. React renders; a region the app streams comes in after the frame (the template has none).
5. The browser fetches about 20 JavaScript chunks (`/assets/*`) and App Bridge/Polaris from Shopify's CDN.

Client-side navigations skip 1, 2 and the layout loader (its `shouldRevalidate` answers false unless a form was submitted): only the page loader runs.

## Rules

1. **Never await on the response path what the page does not need.** `afterAuth` belongs to the preset; the app adds nothing in front of it. In a
   loader, await authentication and what the page cannot paint without. `waitUntil` has a shared budget of about 30 s and is then cancelled, so only
   decoration and work something else repairs may ride it.
2. **Every outbound call has a timeout.** The preset's Partner API read has one (10 s, `AbortSignal.timeout`). A Shopify Admin or Partner call in a
   loader needs one too, and a loader should not wait for it unless the page is wrong without it.
3. **Read once per request.** A pure read that several call sites repeat is made once, in the loader, and passed down. Never memoise in module
   scope: an isolate is shared across shops (`.claude/rules/core.md`).
4. **Do not write KV on a read path.** KV rate-limits writes to one key (about one a second); concurrent writers to one key are a bug.
5. **Hashed assets are cached for a year.** `public/_headers` has `/assets/*` with `public, max-age=31536000, immutable`. Vite puts a content hash in
   every filename there, so a deploy changes the URL, and the document (rendered by the Worker, never cached by this rule) always points at the
   current files. Do not add `immutable` to a file whose URL never changes (a service worker, an image linked from an email).
   `app/core/public-headers.test.ts` pins this.
6. **The Worker bundle is minified** (`environments.ssr.build.minify` in `vite.config.ts`, with names kept), because every cold isolate parses it.
   Code must not depend on a function or class name: Shopify's `boundary.error` compares `error.constructor.name` with `"ErrorResponseImpl"` and a
   minified bundle renames it, which is why `thrownResponseHtml` (`app/components/thrown-response.ts`) exists. Read an error by `status`/`code`/`instanceof`.
7. **A loader's cost is the number of sequential D1 waits.** D1 runs one query at a time per database, so `Promise.all` saves network time, not
   database time. Combine reads with `db.batch`, never query in a loop, and put anything a page does not need to paint behind a streamed region
   (`.claude/rules/polaris-app-home.md`, "Loading").
8. **Nothing scans a shop's whole history on a page view.** A query behind a list, a count or a dashboard must be bounded by an index that matches its
   `WHERE` and `ORDER BY` (tenant first), or read a counter or a short-lived cache. "50 000 rows for one shop" is the test case. Check with
   `EXPLAIN QUERY PLAN`; a `SCAN` or `USE TEMP B-TREE` over the shop's rows is the red flag. Production tables get new indexes by a forward-only
   migration (`.claude/rules/data.md`).
9. **Polling is bounded.** A revalidation loop has a ceiling (time or count), backs off, and pauses when `document.hidden`. An unbounded 3 s loop re-runs
   the whole loader for every open tab.
10. **A streamed region that can take longer than `streamTimeout` (5 s in `app/entry.server.tsx`) is a defect:** it renders as a failure to a shop that is
    merely large.

## Measuring

Do this before and after any change that claims to make the admin faster.

| What | How |
|---|---|
| Real-user numbers (LCP, CLS, INP, p75 over 28 days; Built for Shopify needs LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms) | Dev Dashboard → app → Monitoring. In code, `shopify.webVitals.onReport` |
| Round trips versus compute | Workers Observability: compare `wallTimeMs` with `cpuTimeMs` per route. Wall far above CPU means D1/KV/outbound waits |
| Cold start | `npx wrangler check startup -c build/server/wrangler.json` on the production build, or the "Worker Startup Time" line of `wrangler deploy` |
| Rows read | D1 insights: `rows_read` per query, largest shops first. D1 does not run `ANALYZE` for you: local plans can differ |
| Bundle | `npx react-router build`, then sizes under `build/server/assets` and `build/client/assets` |
| Where D1 lives | `wrangler d1 info`; compare with the Worker's colo. Smart Placement (`placement.mode: "smart"`) and the read-replica Sessions API are options **only after measuring** |

Lighthouse is unreliable for an embedded app (it runs outside the Shopify iframe).

Not done in the template, recorded so nobody assumes otherwise: Smart Placement and D1 read replication (they need measuring), and Workers Web Vitals reporting.
