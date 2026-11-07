# Members — who may use the app, and what they may do

A **member** is a person from the merchant's side: a Shopify staff user linked to one shop, with one role (and, in an app that
lets merchants choose, optionally a set of permissions of their own). Identity is
Shopify's (the ID token's `sub`); the app has no password and no sign-up. What a member may do to the shop's Shopify
data is Shopify's decision (the store owner's staff permissions); roles here decide only what they may do **in this
app**.

```
request → authenticateAdmin (Shopify proves who)  →  guardMember (the app decides)
                                                         │ identityFromAuth   who is asking
                                                         │ resolveMember      find / admit / refuse  (pure rules + store)
                                                         └ can(member, permission)   a role's preset, or the member's own set
```

## Where each decision lives

| Decision | File | Ring |
|---|---|---|
| Permissions, roles, `can`, `canAssignRole` (the owner-only rule lives here) | `app/domain/member-access.ts` | 1 |
| A membership's lifecycle (`invited / pending / active / removed`) | `app/domain/member-lifecycle.ts` | 1 |
| Who gets in: the fixed rules, then the app's policy for strangers | `app/domain/member-admission.ts` | 1 |
| **The app's choices** (policy, default role, online tokens) | `app/members/config.ts` | config |
| The seat limit: reading it from the plan, the cap a write is given, and the STRICT reading used to take a seat away | `app/domain/member-seats.ts`, `app/adapters/member-seats.server.ts` | 1, 4 |
| What happens when the team is over the plan's seats (policy, episode, who goes first, who is told) | `app/domain/member-seat-overage.ts` | 1 |
| The team as the page shows it: order, what a row offers, contacts to ask | `app/domain/member-team.ts` | 1 |
| Gather facts, carry the decision out, race-safe | `app/services/members/resolve-member.ts` | 3 |
| Invite, change a role, remove, let in, restore | `app/services/members/invite-member.ts`, `manage-members.ts` | 3 |
| Review one shop's seats (open an episode, notify, cancel, trim) and the cron's sweep | `app/services/members/review-seat-overage.ts`, `sweep-seat-overage.ts` | 3 |
| The only queries on `shop_members`, and on `member_seat_episodes` | `app/models/members.server.ts`, `app/models/member-seat-episodes.server.ts` | 4 |
| Binding the review: dependencies, the plan-change hook, the cron sweep | `app/wiring/member-seat-overage.server.ts` | 5 |
| The guard routes call | `app/admin/require-member.server.ts` | 5 |
| A member's own set: what it may hold, how a stored one is read, who may be given one | `app/domain/member-permissions.ts` | 1 |
| The Team page (`/app/members`): the list, the invitation, and a link to each person | `app/routes/app/members/index.tsx`, `members.server.ts`, `app/components/members/` | 5 |
| One person's page (`/app/members/:memberId`): their detail, and EVERY action on them. The role and the permissions are ONE draft (a select and boxes) saved with the save bar; letting in, restoring and removing are acts sent at once. A person not on this shop's team is a 404 | `app/routes/app/members/detail.tsx` (loads and answers), `app/components/members/MemberDetailView.tsx`, `use-access-draft.ts`, `app/domain/member-access-draft.ts` (the draft's rules, pure), `loadMember` in `members.server.ts`, `memberDetail` in `app/domain/member-team.ts` | 5, 1 |
| The page that says why someone is kept out, and who to ask | `app/components/admin/NoAccess.tsx` | 5 |
| A shop's team, read-only, for staff | `app/routes/internal/shops/detail-team.tsx` | 5 |

## Roles

| Role | Holds | Special |
|---|---|---|
| `owner` | all four permissions (`app:view`, `app:manage`, `billing:manage`, `members:manage`) | the only role that may make, change, remove, approve or restore an owner |
| `admin` | the same four permissions | separate from `owner`: cannot assign `owner` or touch a member whose role is `owner` |
| `member` | `app:view`, `app:manage` | |
| `viewer` | `app:view` | |

`canAssignRole(actor, role)` is the one place for both rules: `owner` only by an owner; any other role only by an actor
holding every permission it carries. `manage-members` reads it for the target as well, so touching an owner needs an owner;
the Team page's and the person page's `can.*` flags read it too (one `rowOf`), so a button never offers what the server refuses.

## What a member holds: a preset, or a set of their own

```
holds = member.permissions ?? ROLE_SPECS[member.role]          (grantsOf)
```

A role is a **preset**. A member holds EITHER their role's preset, read live from code, OR a set of their own (`shop_members.permissions`,
a JSON list; NULL is the usual value), never a difference from the preset. With a set, `role` is only what they were based on. That keeps
what someone holds visible and stable: it never changes because a preset did, and a permission an app adds later is shown unchecked.

Every question about what someone may do takes the **member** (`can(member, permission)`, `grantsOf`, `canAssignRole(actor, role)`), never a
bare role: the compiler rejects `can(member.role, ...)`, so no call site can read the role of someone with a set of their own. `presetOf(role)` is
the preset alone (the config check, the "who could be asked" query).

Whether a merchant may give a member a set is the app's choice, `MEMBERS.customPermissions`:

| | `enabled: false` (the template's default) | `enabled: true` |
|---|---|---|
| The member's page | the role and what it allows, read-only list of permissions | the same, and every permission is a checkbox; saving gives the member a set |
| The column | never written | written whole, in the registry's order |
| Choosing a role | applies the preset | applies the preset and DROPS the set (asked first, in a dialog) |

Rules, in `member-permissions.ts` and held by every layer (the service, the single UPDATE, the page):

- **Nobody gives what they do not hold** (`checkCustomPermissions`: `cannotGrant`).
- **`members:manage` only comes with a role** (`ALWAYS_PROTECTED`, and `alsoProtected` adds more, the plan for instance). The "shop keeps someone who can manage the team" guard is
  decided by the database from roles alone, so a manager is an active member on a manager role's PRESET (`permissions IS NULL`). A member with a set is never one,
  whatever role they were based on, and giving a set to the last manager is refused in the same statement (`lastManager`).
- **An owner and Shopify's account owner never have a set** (`ownerFixed`); only an ACTIVE member can be given one (`invalidState`).
- **A set always includes the way in** (`FLOOR_PERMISSION`, `app:view`); one that does not is `permissionInvalid`. So is a name that is not a permission, said before a refusal for policy.
- **Applying a role, letting someone in, restoring them, removing them and restoring the account owner all drop the set.** A returning person starts on a preset.
- **A damaged stored value reads as an EMPTY set, never as "no set"** (which would hand back a preset wider than what was chosen): `readStoredPermissions` answers `damaged`, and the repository logs `member.permissions_damaged` by shop hash. A name the code no longer knows is dropped.
- Seat trimming and the notice recipients read the set (`can`), so a member with a set is not counted as a manager and is not told about seats; where they stand in a trim is the
  role they were based on.

## Asking a permission: three entry points, one rule

A page, a route and the domain ask the same question, each in one line, and none knows where the answer comes from (a role's
preset or a member's own set):

| Where | Ask | Notes |
|---|---|---|
| A route (loader or action) | `await guardMember(request, "app:manage")` | 403 when the person lacks it; the lock |
| The domain and the use cases | `can(member, "app:manage")` | takes the MEMBER, never a role |
| A page (to hide what cannot be used) | `const { can } = useAccess()` (`app/admin/access.tsx`) | the layout provides it; outside it every answer is no; courtesy only |

## The member's page: role and permissions are one edit

The role select and the permission boxes are ONE draft (`member-access-draft.ts`, pure and tested): choosing a role fills the boxes
with its preset; ticking a box keeps the role as what the member is based on. Save (the admin's save bar, driven by the draft through
`FormSaveBar`'s `dirty` prop) sends `changeRole` when the ticks are exactly a role's preset, else `setPermissions` with the role named
(one write). Discard puts the draft back. "Use {role} permissions" returns to the preset. A permission that cannot be changed (the way
in, what only comes with a role, what the looker lacks) is a PLAIN ROW, not a disabled checkbox: a disabled control fades the words
the merchant is reading. Once the ticks stop being a preset, what only comes with a role is let go (a set never holds it).

## Rules that never change, whatever an app configures

- A known active member is let in.
- **Owner is only ever Shopify's account owner, or someone an existing owner made an owner.** `associated_user.account_owner`
  is authoritative: that person always gets in as `owner`, even from a pending, removed or lowered row, and past any seat
  limit (nobody is locked out of their own store). Nobody becomes an owner by being first.
- The **first person ever to open the app on a store is an `admin`** (reason `first_user`), whatever the policy and the seat
  limit. "First" means NO membership row with a Shopify user id exists for the shop in ANY status (active, pending and
  removed all count; an invitation nobody took up has no user and does not). So removing the first admin does not make the
  next stranger "first".
- A **collaborator** (`associated_user.collaborator`, an agency) is never the first-user admin and never becomes an owner by
  being first: they follow `onUnknownUser` / `autoJoinRole` like any stranger. If Shopify also says they own the store,
  account owner wins.
- A member **removed on purpose** stays out until someone with `members:manage` restores them, however open the policy is
  (restoring an owner needs an owner). Only the Shopify account owner comes back by opening the app.
- Nobody can grant a role carrying a permission they lack, and only an owner touches `owner` (`canAssignRole`); a role handed
  to strangers must not carry `members:manage` or `billing:manage`, which now rules out `admin` and `owner`
  (`memberConfigProblems`).
- **A seat is only ever taken away by the seat-overage policy, and only an app that chose it** (`MEMBERS.seatOverage`, below). The
  shipped policy is `never_remove`.
- **The shop always keeps at least one active member who holds `members:manage`** (an owner or an admin): the last one
  cannot be removed or demoted out of those roles (`lastManager`), and the last active owner cannot be removed or demoted
  (`lastOwner`). A shop with NO owner at all is valid (every first-user shop starts that way).
- An unknown role reads as `viewer`, an unknown status as `removed`: stored values outlive the code, and neither widens access.

## The decision, in order

`decideAdmission` (pure) checks, first match wins:

| # | Facts | Decision |
|---|---|---|
| 1 | has a membership: account owner and (not active, or not an owner) | `restore_owner` (active owner, no seat check) |
| 2 | has a membership: active | `allow` |
| 3 | has a membership: removed / pending (a pending row with `trimmed_at` set: `seat_limit`) | `deny` `removed` / `pending` / `seat_limit` |
| 4 | no membership, account owner | `create` owner, active, `account_owner`, no seat cap |
| 5 | no membership, nobody has opened the app, not a collaborator | `create` admin, active, `first_user`, no seat cap, race-safe |
| 6 | everyone else | the app's policy (`auto_join`, `invite_only`, `approval`) |

## What an app changes, and the cost

| Change | Where | Cost |
|---|---|---|
| How strangers are handled (`auto_join`, `invite_only`, `approval`) | `MEMBERS.onUnknownUser` | one value |
| The role strangers get | `MEMBERS.autoJoinRole` | one value |
| A new policy | `UNKNOWN_USER_POLICIES` + one entry in `UNKNOWN_USER` | the compiler names the rest |
| A new permission | `MEMBER_PERMISSIONS`, then the roles that hold it, then its name and description in `permission-text.ts` and `members.permissions.<key>` in every language (no colon in the key: i18next reads it as a namespace); routes ask with `guardMember(request, "x:y")` | no migration |
| Let merchants choose each person's permissions | `MEMBERS.customPermissions = { enabled: true, alsoProtected: [...] }` | one value; the column and the editor already exist |
| Permissions that only ever come with a role in this app | `customPermissions.alsoProtected` (`members:manage` always is) | one value |
| A new role | `MEMBER_ROLES` + `ROLE_SPECS`, and `members.roles.<role>` in the `admin` catalogue | no migration (the column is plain text) |
| Ask Shopify for the person's email and name | `MEMBERS.onlineTokens` | `invite_only` needs it |
| Hold the team to the plan's seats (notify, then trim) | `MEMBERS.seatOverage = { policy: "notify_then_trim", noticeHours: 72 }` and a plan with `members.max` | one value; see "Seats" |
| Who loses a seat first beyond role rank (fewest privileges first) | `memberPrivilege()` in `app/wiring/member-seat-overage.server.ts` (returns a `MemberPrivilege`) | one function |
| How the two notices are delivered or worded | events `members_seat_trim_notice`, `members_seats_trimmed` (spec, payload, template, `email` catalogue) | the template and its locale keys |

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

## Edge cases that are decided, and where they are tested

Tests: `O` = `app/services/members/review-seat-overage.test.ts` (real local D1, the notifier and the plan faked), `W` = `app/wiring/member-seat-overage.test.ts`, `X` = `sweep-seat-overage.test.ts`, `D` = `app/domain/member-admission.test.ts`, `A` = `member-access.test.ts`, `R` = `app/services/members/resolve-member.test.ts`,
`M` = `manage-members.test.ts`, `S` = `app/models/members.test.ts` (real local D1), `I` = `app/routes/app/members/members.integration.test.ts`
(real D1 through the page's use cases), `C` = `app/members/config.test.ts`, `T` = `app/domain/member-team.test.ts`, `K` = `contacts.test.ts`.

| Case | Decision | Tested in |
|---|---|---|
| First user, not account owner, not collaborator | Active `admin`, `first_user`, under every policy, seat limit 0 ignored (the plan is not even asked) | D, R |
| First user is the account owner | `owner`, reason `account_owner`, not `first_user` | D, R |
| First user is a collaborator | Follows the policy (auto_join: `autoJoinRole`; invite_only: `not_invited`; approval: pending viewer) | D, R |
| Someone after a collaborator who joined or waited | NOT admin (a row with a Shopify user exists) | R |
| Someone after a collaborator who was turned away under `invite_only` | IS the admin: nothing was recorded, so nobody has "opened" it, and otherwise nobody could ever invite | R |
| First admin removed later; a new stranger opens the app | NOT admin (follows the policy); the removed admin is kept out (`removed`) | R |
| Two simultaneous first opens | One admin; the loser re-reads and follows the policy (one conditional INSERT) | S (`Promise.all`), R |
| Account owner arrives while an admin runs the store | New active owner; the admin is untouched; seats may exceed the cap | R |
| Account owner who already has an active admin / removed / pending row | `restore_owner` (active owner, past any limit) | D, R |
| Team at the seat limit when the account owner arrives | Active owner, total N+1, nobody changed, next stranger `pending` | R |
| Account owner restored while the plan is over its limit | Restored, no seat check | R |
| Removed person who is not the account owner | Stays `removed` under all policies; restored only by `members:manage` | D, R |
| Admin acting on an owner (change role, remove, approve, restore) or assigning `owner` | `forbidden`; an owner may | A, M, I, T |
| Admin acting on themselves | `notYourself`; may manage members and other admins | M |
| Last owner removed or demoted | `lastOwner`, in the UPDATE | S, M |
| Last `members:manage` holder removed or demoted (two admins at once) | `lastManager`: exactly one lands, in the UPDATE | S, M, I |
| Unknown role / status stored | Reads as `viewer` / `removed` | S |
| `autoJoinRole` that carries `members:manage` or `billing:manage` (`admin`, `owner`) | Reported by `memberConfigProblems` | C |
| Kept-out person with no owner on the shop | Contacts are the admins | T, K |
| The ID token's `sub` and the online profile's id | The member is keyed by `sub`; a mismatch is logged (`member.user_id_mismatch`), never acted on | `require-member.server.test.ts` |
| An email Shopify has not verified | Ignored: never matched to an invitation, never stored | R, `identity.test.ts` |
| Two requests for the same new person | One row: `create` conflicts, the loser reads again | R, S |
| Two requests for the last seat | Exactly one is active, the other waits | S, "never gives the last seat..." |
| An invitation for another shop, or taken twice | Never matched; taken once | R, S |
| A form with a forged role, id or intent | An error result, never a crash or another shop's row | I |
| `never_remove` (the default): shop over its limit, an episode past its deadline | Nothing is read, sent or changed | `O` (`review-seat-overage.test.ts`), `W` (`member-seat-overage.test.ts`), `X` (`sweep-seat-overage.test.ts`), `C` |
| A refused, unknown-feature, unlimited, wrong-kind or unreadable entitlement answer | Never a number, never 0: nothing is trimmed, no episode is opened | `member-seats.test.ts`, `member-seats.server.test.ts`, `O` |
| Limit becomes unreadable between the notice and the deadline | Nothing is trimmed, the episode stays open, the next review decides | `O` |
| Notice cannot be handed to the queue / nobody has an address | `notified_at` stays null, no deadline runs, never trimmed, retried by the sweep | `O`, `X` |
| Deadline: one ms before / exactly at | Waits / trims | `member-seat-overage.test.ts`, `O` |
| Two reviews at once (open, notice, trim) | One episode; both notices carry one dedupe key per recipient; the shop ends AT its limit, never under it | `member-seat-episodes.test.ts`, `S`, `O` |
| A seat frees, the plan is upgraded or becomes unlimited, or the app is uninstalled before the deadline | Episode resolved "cancelled", nobody touched | `O` |
| Owner arrives at a full shop under `notify_then_trim` | Admitted past the limit, counted, never the one trimmed | `seat-overage-access.test.ts` |
| Only owners (or the last manager) are over the limit | No episode (`nothing_trimmable`); a manager is skipped and the next candidate taken | `member-seat-overage.test.ts`, `O` |
| Trimmed person opens the app / is approved / is removed and restored | `seat_limit` screen / back only while a seat is free, `trimmed_at` cleared / no seat mark | `seat-overage-access.test.ts`, `S`, `D` |
| Privilege scores fail at the deadline | Nothing is trimmed that round | `O` |
| A shop is purged | Its episodes go; the scan's cursor goes if it names the shop | `tenant-purge.test.ts` |

## Known limits (honest, not hidden)

- **A person removed from the store in Shopify is not detected**: their membership stays active and keeps its seat until an
  owner removes it. The page shows when each person was last seen so an owner can tell. (Listing a store's staff needs a
  scope this template does not request.)
- **Collaborator accounts** (agencies) are read by exactly one rule: a collaborator is never the first-user admin. Otherwise
  they are ordinary members under the chosen policy. How Shopify flags an agency's staff in practice is unverified
  (`shopify-api-invariants.md`); a collaborator who is not flagged is taken for staff.
- **"Someone has opened the app" is read from membership rows.** Under `invite_only` a turned-away collaborator leaves no row,
  so the next non-collaborator stranger still becomes the first admin. That is deliberate: under `invite_only` nobody can be
  invited until a member exists, so the first admitted person has to be that admin.
- **A team without an owner is valid and common** (every first-user shop starts without one). Only Shopify's account owner
  opening the app, or an existing owner, creates one.
- **Team changes are logged, not stored**: `member.role_changed | removed | approved | restored | permissions_changed` (the last names the permissions added and taken away) carry the acting member's id
  and the shop's hash. An app that needs an audit table adds it beside `shop_members`.
- **Seat trimming (`notify_then_trim`) is only as good as its inputs.** The plan's limit comes from the entitlement projection
  in D1 (the template's default snapshot sets no `verifiedAt`, so it never goes stale and `check` never calls Partner), so a
  plan change the app has not observed yet is not seen until it is (webhook, history or refresh): the review never goes to
  Shopify or Partner itself. A shop whose limit cannot be read is left alone. The recipient's language is the default one. The notice email was proven
  to be queued, not to reach an inbox.
- **A review that stops between the notice and closing the episode** leaves the episode recorded "cancelled" for a trim that
  happened (the notice is sent first on purpose: a lost notice matters more than a wrong label).
- **Privilege scores only order people of the same role.** Role rank comes first, and a member the app gave no score is
  protected, so an app that scores only some people trims the scored ones first.
- **No "request access" email yet**: a kept-out person is shown who to ask; nobody is notified.
- **A member with a set of their own does not receive a permission added later.** It is shown unchecked in their editor and access fails closed; choosing a role gives them the preset again.
- **There are no merchant-named roles.** A set belongs to one person; to give several people the same set the merchant ticks it for each, or an app stores roles beside the registry and passes them through `can`.
- **The team page does not show which permissions a person with a set holds**, only that they have a set (a badge); the permissions are on their own page. The staff console shows the same marker and no list.

## Writing a route

- Call `guardMember(request, permission)` instead of `authenticateAdmin`; it returns everything `authenticateAdmin` did,
  plus `member`. The server is the lock: a page also hides what a member cannot use, but only to be kind.
- Ask for the **permission the page needs**, not for a role. Never compare `member.role` in a route.
- The guard memoises per request, so the layout and its page cost one lookup.

## Verified, and not

Verified against shopify.dev (2026-11; `account_owner` and `collaborator` definitions re-read 2026-11-07): the ID token's `sub` is the user; online tokens (`useOnlineTokens: true`) add
`associated_user` (`id`, `email` + `email_verified`, names, `account_owner`, `collaborator`) and expire after 24 hours or
on logout.

**Unverified — check before relying on it:**
- that `sub` and `associated_user.id` are the same value (the guard logs `member.user_id_mismatch` if they ever differ);
- that the first person to open the app on a store is someone who should run its team ("first user is admin" is OUR
  decision, not Shopify's; the account owner is made an owner whenever they open the app, so the store gets its owner anyway);
- how Shopify marks an agency's collaborator account in practice (only its one-line definition is known; a collaborator who is
  not flagged is taken for staff and could be the first admin).
