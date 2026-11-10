---
paths:
  - "app/domain/member-seat*"
  - "app/domain/member-team*"
  - "app/models/member-seat*"
  - "app/services/members/*seat*"
  - "app/wiring/member-seat*"
  - "app/members/config*"
---

# Members — seats and the seat-overage policy

Part of the members contract (`.claude/rules/members.md`).

## Seats

A seat is an **active** membership. The limit is the entitlement catalogue's `members.max` (a capacity), so the app asks for
a key and never compares plan handles. Whether the shop is within it is counted from `shop_members` **in the same SQL
statement that makes someone active** (`SeatCap` on `create`, `acceptInvite`, `activate`), so two requests cannot both take
the last seat and there is no second counter to drift.

- `unlimited` on every plan (the shipped default) means no limit; **removing the `members.max` key** from the catalogue means
  the app never asks. Give a plan `{ kind: "limit", maximum: n }` to start limiting.
- Owners and the first admin are never kept waiting: the first user (an admin), the Shopify account owner and an owner
  restored are admitted past any limit (the plan may be unreadable on a first visit, which counts as a limit of 0), and still
  count toward it. With N active members on a plan of N, the account owner who opens the app becomes an active owner (N+1
  seats used), nobody else is changed, and the next stranger is `pending`.
- Someone who would become active with no free seat is recorded `pending` (an owner sees them and can let them in once a seat
  is free). A taken-up invitation does the same, keeping its role.
- **A refused or unreadable entitlement** (inactive subscription, a key defined as the wrong kind) gives NO new seats, while
  members already active keep their access. That reading (`seatLimitFrom`) turns a refusal into a limit of 0, which only ever
  keeps someone WAITING. It must never be used to take a seat away: see the strict reading below.
- Pending, invited and removed members take no seat. Removing someone frees theirs at once.

### What happens when the team is over the limit: `MEMBERS.seatOverage`

An app chooses one policy, in `app/members/config.ts`:

| Policy | What it does |
|---|---|
| `{ policy: "never_remove" }` **(the shipped default)** | Nothing. A downgrade removes nobody: the team may exceed the new limit, the page says so, and nobody new can join until it is within it. The review returns before reading anything, the cron sweep returns before a query, and the plan-change hook builds nothing. |
| `{ policy: "notify_then_trim", noticeHours }` | Tells the people who can fix it, and if the shop is still over when the notice period ends, takes the extra people off their seats. `noticeHours` is a whole number from 1 to 168 (`memberConfigProblems`). |

Nothing else is configured. Whether the plan limits seats at all is still the catalogue's say (`members.max`): an app with no
limit never has an episode.

**The strict limit, and why.** `overageLimitFrom(check)` (`member-seats.ts`) answers a limit only for an allowed capacity with a
whole-number maximum of 1 or more. `unlimited` (a capacity with no maximum) is nothing to enforce. **Everything else is
`unknown` and nothing is trimmed on it**: a refusal of any kind (`disabled`, `inactive_subscription`, `unknown_plan`,
`subscription_unavailable`, `unknown_feature`), a key defined as a capability or quota, a maximum that is not a whole number or
is below 1. This is the opposite of `seatLimitFrom`, which reads a refusal as 0; acting on that 0 would take everybody's seat
because of an outage or a mis-synced subscription. `trimmableLimitFrom` is the same reading as a plain number (or null).
The review reads it FRESH (`MemberSeats.overageLimit`: the request's memo of the shop's subscription is dropped first, and
`check` never reads the KV cache), and a trim re-checks the count in the database, so a cached or stale answer cannot take a seat.

**The episode** (`member_seat_episodes`, one open per shop, enforced by a partial unique index):

```
over the limit, no episode  -> open an episode (detected_at)
episode, nobody told yet    -> hand the notice to the queue; ONLY IF it was taken, record notified_at and deadline_at = notified_at + noticeHours
now >= deadline and still over, limit read fresh -> trim exactly (active - limit) people, notify them, resolve "trimmed"
back within the limit / plan upgraded / unlimited / app uninstalled, at any time -> resolve "cancelled", nobody touched
```

- **A shop that cannot be told is never trimmed.** `Notifier.send` is fire-and-forget (a refused enqueue is logged and
  recorded, and the caller never learns), so the review uses `HandoffNotifier.handOff`, which says whether the queue took the
  message. No recipient with an address, or a queue that refuses every message, leaves `notified_at` null, and the sweep tries
  again. `queued: true` means the message is durable on the queue, not that the email arrived.
- **Who is told**: active owners with an address; else active admins with one; else the shop's own contact address
  (`shops.email`, then `contact_email`); else nobody. Each address once. The notice names, by name, who would be removed if
  nothing changes (at most ten, the rest counted), the limit, the count and the deadline in the reader's language and the
  shop's time zone. Dedupe keys `seat-trim-notice:<shop>:<episodeId>` and `seats-trimmed:<shop>:<episodeId>` (the pipeline
  dedupes per key AND recipient), so two reviews that run together, or a retry, send each person one.
- **Who goes first** (`selectTrimmed`): role rank (viewer, member, admin; never an owner); then the app's optional privilege
  score, fewer first (someone the app could not score is protected, not trimmed first); then the longest unseen (never seen
  first); then the newest member; then id, so the order is total. Exactly `active - limit`, never more.
- **Never trimmed, ever**: an owner; Shopify's account owner (`account_owner`, whatever role they were given: they come back
  as an owner the moment they open the app); the last active member who holds `members:manage` (that person is skipped and
  the next candidate taken; if protection stops the count short the rest is left and logged as `shortfall`). When every
  person who is over is protected, no episode is opened at all (`nothing_trimmable`): warning people about what nobody can
  enforce is noise.
- **A trim is one conditional statement per person** (`MemberRepo.trim`): still `active`, not an owner or account owner, not
  the last manager, AND the shop's active count still above the limit, in that same statement. Two reviews cannot take two
  seats for one. The person becomes `pending` with `trimmed_at` set. Opening an episode, recording the notice and resolving are
  each one conditional write too.
- **The way back**: a trimmed member sees the `seat_limit` screen when they open the app ("your plan has no free seat for
  you"), not the "waiting for approval" one. The Team page shows them as "No seat". A person with `members:manage` lets them
  in with approve, which goes through the cap-aware `activate`: it works only while a seat is free (owners are exempt) and clears
  `trimmed_at`. Removing them clears it too. Nothing re-admits them automatically.
- **When it runs**: (1) after a plan change: `afterPlanChange` (`wiring/member-seat-overage.server.ts`) is what
  `ShopSubscriptionRepo` calls where it used to call `invalidateEntitlements` (a subscription observed by webhook, history or
  refresh) and what a promotional plan grant or revoke calls; it drops the entitlement cache as before, then, only under
  `notify_then_trim`, reviews the shop through `runAfterResponse`, and a failure is logged and never fails the plan change.
  (2) the cron sweep `member_seat_overage` on every tick (the hourly probe-only one included, so a deadline is met within about
  an hour): shops with an open episode that still needs its notice or whose deadline passed, and the next batch of 50
  installed shops with more than one active member, from a cursor kept in the global checkpoint `member_seat_overage_scan`
  (the tenant purge clears it when it names the purged shop). A fleet bigger than one batch is covered over several ticks.
  No cron entry or binding was added: the template's existing crons and `NOTIFICATION_QUEUE` carry it.
- **Privilege scores are optional.** `memberPrivilege()` in the wiring returns nothing by default. An app that has a notion of
  what a member can do returns a `MemberPrivilege` (`scores(shop, ids) => Map<id, number>`, higher is more). If asking for
  scores fails at the deadline, nothing is trimmed that round (the order would be a guess) and the review says so.
- **What an app supplies**: the policy and `noticeHours` (config), a plan that limits seats (catalogue), optionally the privilege
  scores (wiring), and the words (the two events' `email` keys, in every language it ships). Notices go out as email through
  the one notification pipeline; the recipient's language is not known per person, so they are written in the default language
  unless an app adds a source for it (`language` on the payload).

