---
paths:
  - "app/members/**"
  - "app/services/members/**"
  - "app/domain/member-*"
  - "app/models/member*"
  - "app/wiring/member*"
  - "app/admin/require-member*"
  - "app/admin/access*"
  - "app/routes/app/members/**"
  - "app/components/members/**"
  - "app/routes/internal/shops/detail-team*"
---

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

## Where the code is

Domain rules `app/domain/member-*` (ring 1: access, admission, lifecycle, permissions, seats, team); use cases `app/services/members/`; the only queries `app/models/members.server.ts`; config `app/members/config.ts`; the guard `app/admin/require-member.server.ts`; pages `app/routes/app/members/` and `app/components/members/`. Full file-by-file map: `docs/members.md`.

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
| Choosing a role | applies the preset | applies the preset to the DRAFT (the boxes follow it at once); saving it drops the set. There is no dialog: Discard and the save bar are the way back |

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

## Invitations are not people

`inviteMember` only **saves a row** (`invited`, no Shopify user, the address and a role). **Nothing is emailed**: the person joins the first
time they open the app with that address verified by Shopify (`resolveMember` matches it), so the words say "saved" and "ask them to open
the app", never "sent" (no notification event exists for it; adding one is a separate decision).

- **Cancelling an invitation DELETES the row** (`MemberRepo.cancelInvite`: `status = invited AND shopify_user_id IS NULL`, shop-scoped, one
  statement). There is no person behind it, it holds no seat and nothing refers to it, so a "removed" copy would only be a row that can never
  be restored. The address can be invited again.
- **A row with no Shopify user is never activated by hand.** `activate` carries `shopify_user_id IS NOT NULL` in the same statement as the
  status and the seat guards, `remove` refuses it too (it is cancelled, not parked), and `canOf` offers no restore/approve for an unlinked row.
- Old data may hold a *removed* row that never had a user (a cancelled invitation from before). It is left out of the list and the counts
  (`notCancelledInvitation` in the model), the person's page answers 404 for it, and `activate` refuses it. Nothing deletes it; a one-off
  clean-up is a separate, deliberate operation.

## What the pages say about seats

The page-only reading `seatReadingFrom` is NOT `seatLimitFrom`: admission still treats a refusal as limit 0 (nobody new gets in), but the
words never print "3 of 0, over the limit" for a plan that could not be read. It is `limit | unlimited | unknown` (`unknown` for an
inactive/unknown/unreadable plan; `disabled` is a real limit of 0). `MemberSeats.reading` is the port for it.

- The team page shows `unknown` as "Seats in use: N" plus "we cannot read your plan's seat limit". Two banners tell **waiting** (needs an answer)
  apart from **no seat** (`trimmed_at`: the plan has no room); both are counted from `countByStatus` (`StatusCounts.noSeat`), not from the
  capped list. When the list was read up to its cap (500) a notice says how many people it left out (`hiddenCount`).
- One person's page loads the seat answer **only** for someone who could be let in (`pending`/`removed` with a Shopify user): `activationSeat`
  gives `open`, `full` or `unreadable`, and the let-in/restore button is disabled with the reason beside it (and a link to the plan for someone
  who holds `billing:manage`). The server answers `noSeat` for the same cases, so a button never promises what would be refused.
- The invite form says, when no seat is free or the plan cannot be read, that the person is saved but **waits** to be let in.
- The person's page for someone who cannot use the app (invited, waiting, no seat, removed) says why in the Access section and **does not
  show permissions** (those belong to active members). Letting in/restoring is ONE role select and ONE button.

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

## Writing a route

- Call `guardMember(request, permission)` instead of `authenticateAdmin`; it returns everything `authenticateAdmin` did,
  plus `member`. The server is the lock: a page also hides what a member cannot use, but only to be kind.
- Ask for the **permission the page needs**, not for a role. Never compare `member.role` in a route.
- The guard memoises per request, so the layout and its page cost one lookup.


## Deeper reference (read when needed, not loaded automatically)

- Seat limits, the over-limit episode, notify-then-trim: `.claude/rules/members-seats.md` (loads when you touch seat code).
- Every decided edge case and where it is tested, the known limits, and what is verified: `docs/members.md`.
