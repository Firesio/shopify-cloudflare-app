# Members — who may use the app, and what they may do

A **member** is a person from the merchant's side: a Shopify staff user linked to one shop, with one role. Identity is
Shopify's (the ID token's `sub`); the app has no password and no sign-up. What a member may do to the shop's Shopify
data is Shopify's decision (the store owner's staff permissions); roles here decide only what they may do **in this
app**.

```
request → authenticateAdmin (Shopify proves who)  →  guardMember (the app decides)
                                                         │ identityFromAuth   who is asking
                                                         │ resolveMember      find / admit / refuse  (pure rules + store)
                                                         └ can(role, permission)
```

## Where each decision lives

| Decision | File | Ring |
|---|---|---|
| Permissions, roles, `can`, `canAssignRole` (the owner-only rule lives here) | `app/domain/member-access.ts` | 1 |
| A membership's lifecycle (`invited / pending / active / removed`) | `app/domain/member-lifecycle.ts` | 1 |
| Who gets in: the fixed rules, then the app's policy for strangers | `app/domain/member-admission.ts` | 1 |
| **The app's choices** (policy, default role, online tokens) | `app/members/config.ts` | config |
| The seat limit: reading it from the plan, the cap a write is given | `app/domain/member-seats.ts`, `app/adapters/member-seats.server.ts` | 1, 4 |
| The team as the page shows it: order, what a row offers, contacts to ask | `app/domain/member-team.ts` | 1 |
| Gather facts, carry the decision out, race-safe | `app/services/members/resolve-member.ts` | 3 |
| Invite, change a role, remove, let in, restore | `app/services/members/invite-member.ts`, `manage-members.ts` | 3 |
| The only queries on `shop_members` | `app/models/members.server.ts` | 4 |
| The guard routes call | `app/admin/require-member.server.ts` | 5 |
| The Team page (`/app/members`) and its forms | `app/routes/app/members.tsx`, `members.server.ts`, `app/components/members/` | 5 |
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
the Team page's `can.*` flags read it too, so a button never offers what the server refuses.

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
| 3 | has a membership: removed / pending | `deny` `removed` / `pending` |
| 4 | no membership, account owner | `create` owner, active, `account_owner`, no seat cap |
| 5 | no membership, nobody has opened the app, not a collaborator | `create` admin, active, `first_user`, no seat cap, race-safe |
| 6 | everyone else | the app's policy (`auto_join`, `invite_only`, `approval`) |

## What an app changes, and the cost

| Change | Where | Cost |
|---|---|---|
| How strangers are handled (`auto_join`, `invite_only`, `approval`) | `MEMBERS.onUnknownUser` | one value |
| The role strangers get | `MEMBERS.autoJoinRole` | one value |
| A new policy | `UNKNOWN_USER_POLICIES` + one entry in `UNKNOWN_USER` | the compiler names the rest |
| A new permission | `MEMBER_PERMISSIONS`, then the roles that hold it; routes ask with `guardMember(request, "x:y")` | no migration |
| A new role | `MEMBER_ROLES` + `ROLE_SPECS`, and `members.roles.<role>` in the `admin` catalogue | no migration (the column is plain text) |
| Ask Shopify for the person's email and name | `MEMBERS.onlineTokens` | `invite_only` needs it |

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
- **A downgrade never removes anyone**: the team may exceed the new limit; the page says so and nobody new can join until it
  is within it. A refused or unreadable entitlement (inactive subscription, a key defined as the wrong kind) gives NO new
  seats, while members already active keep their access.
- Pending, invited and removed members take no seat. Removing someone frees theirs at once.

## Edge cases that are decided, and where they are tested

Tests: `D` = `app/domain/member-admission.test.ts`, `A` = `member-access.test.ts`, `R` = `app/services/members/resolve-member.test.ts`,
`M` = `manage-members.test.ts`, `S` = `app/models/members.test.ts` (real local D1), `I` = `app/routes/app/members.integration.test.ts`
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
- **Team changes are logged, not stored**: `member.role_changed | removed | approved | restored` carry the acting member's id
  and the shop's hash. An app that needs an audit table adds it beside `shop_members`.
- **No "request access" email yet**: a kept-out person is shown who to ask; nobody is notified.

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
