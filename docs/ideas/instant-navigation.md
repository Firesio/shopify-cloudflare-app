# Idea: instant navigation in the embedded admin (not adopted)

Status: **an idea for the owner to decide**, not part of the template. It is what the derived app `team-up-new` does (commit `738fa01`, rules in its `.claude/rules/merchant-speed.md`, numbers in its `docs/PERF-2026-10-26.md`). Facts below were read from that repo; the speed figures are the derived app's own measurement, not re-measured here.

## What it does

Today a client navigation to an `/app/*` page waits for that page's server loader (a round trip plus every read the loader awaits) and only then changes the screen. The derived app makes the route commit in the same frame and shows a skeleton until the data arrives. Its commit message reports 180-360 ms before and tens of ms after for the visible change.

Pieces, all in `team-up-new`:

| Piece | File | Role |
|---|---|---|
| `clientLoader` per page | each `app/routes/app/**/*.tsx` page | `export const clientLoader = ({ serverLoader }) => instantData(serverLoader<typeof loader>())`. It returns the server loader's promise **without awaiting it**, so React Router commits the navigation at once. |
| `instantData()` / `InstantData<D>` | `app/admin/instant-page.tsx` | Wraps the promise as `{ __instant: true, page }` and marks it handled, so an abandoned navigation does not log an unhandled rejection. |
| `InstantPage` | `app/admin/instant-page.tsx` | `<InstantPage data={loaded} skeleton={<XSkeleton />}>{(data) => ...}</InstantPage>`. If `data` is the instant shape it renders `Suspense` + `Await` with the skeleton as fallback; otherwise (a document load, which never runs a client loader) it renders the children with the data directly. A rejected promise goes to `LoaderFailure`, which rethrows it during render so the route's error boundary behaves as if the loader had thrown (and follows a redirect). |
| Per-page skeletons | `app/components/admin/page-skeletons.tsx` (+ `Skeleton.tsx`) | One skeleton per page (`OrdersSkeleton`, `BillingSkeleton`, ...) with the same structure as the loaded page. |
| Preloading likely next pages | `app/routes/app/_layout.tsx` | After ~2.5 s idle the layout renders `<PrefetchPageLinks page="/app/orders" />` for a fixed list of likely next paths. A `clientLoader` only runs if the target route's **module** is already in the browser, and React Router leaves a route with a `clientLoader` out of data prefetching, so this preloads code only, no request. |
| `shouldRevalidate` on the layout | `app/routes/app/_layout.tsx` | Returns `false` for navigations (only revalidate after a form submit), so the shell's auth check and D1 reads do not re-run before every child loader. Safe only because every child loader and action calls `guardMember` itself. |
| Guard test | `app/routes/app/instant-routes.test.tsx` | Globs the page modules and fails for a page with a loader and a component that has no `clientLoader` returning `{ __instant: true, page }` before the server answers. |

## Why it is faster

The screen changes after the click instead of after the loader: the wait is the same, but it is spent looking at the page's frame. The shell is not reloaded on each navigation, and the page's code is already downloaded when the merchant clicks.

## What the template already has

`app/components/admin/Skeleton.tsx`, `Deferred.tsx` (streamed regions), and `app/routes/app/_layout.revalidate.test.ts`; `shouldRevalidate` exists on the layout. There is no `clientLoader`, `InstantPage` or `PrefetchPageLinks` in the template.

## Risks and costs

- A large change: every page gets a `clientLoader`, a skeleton and a wrapper, and each skeleton must keep the loaded page's structure or the layout shifts (the template's testing rule already asks for structural-count tests for loading states).
- The skeleton hides the wait, it does not remove it. Keep the loader's critical path small.
- Code that reads `useLoaderData` now sees two shapes (data, or `InstantData`); types are `typeof loader | typeof clientLoader`.
- `clientLoader` runs in the browser: the module must not pull `*.server` imports into the client graph (see `app/route-module-exports.test.ts`).
- Preloading downloads code for pages the merchant may never open; the list is hand-kept and goes stale when routes change.
- `shouldRevalidate: false` on navigations relies on every child calling `guardMember`; a new child that forgets it would lose the shell's check.
- Streamed errors surface during render (`LoaderFailure`), not at navigation time: error boundaries and App Bridge auth bounces must be re-verified by hand in the Shopify admin.
- Polaris web components cannot be unit-tested, so the visual result needs a manual pass.

## If adopted

Read in `team-up-new`: `app/admin/instant-page.tsx` and its two tests, `app/components/admin/page-skeletons.tsx`, `app/routes/app/_layout.tsx`, one page such as `app/routes/app/orders/index.tsx`, `app/routes/app/instant-routes.test.tsx`, and the "make every merchant page commit a client navigation at once" bullet in `.claude/rules/merchant-speed.md`. Port the core first (`instant-page.tsx` + tests), convert one page, measure in the real admin, then the rest with the guard test.
