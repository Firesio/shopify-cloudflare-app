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
| Permissions, roles, `can`, `canAssignRole` | `app/domain/member-access.ts` | 1 |
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

## Rules that never change, whatever an app configures

- A known active member is let in.
- The first person to open the app on a store becomes its **owner**: the installer is the first member.
- The store's Shopify **account owner** always gets in as owner, even from a pending or removed row (nobody is locked out
  of their own store).
- A member **removed on purpose** stays out until someone restores them, however open the policy is.
- Nobody can grant a role carrying a permission they lack (`canAssignRole`); a role handed to strangers must not carry
  `members:manage` or `billing:manage` (`memberConfigProblems`).
- An unknown role reads as `viewer`, an unknown status as `removed`: stored values outlive the code, and neither widens access.

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
- Owners are never kept waiting: the first user, the Shopify account owner and an owner restored are admitted past any limit,
  and still count toward it.
- Someone who would become active with no free seat is recorded `pending` (an owner sees them and can let them in once a seat
  is free). A taken-up invitation does the same, keeping its role.
- **A downgrade never removes anyone**: the team may exceed the new limit; the page says so and nobody new can join until it
  is within it. A refused or unreadable entitlement (inactive subscription, a key defined as the wrong kind) gives NO new
  seats, while members already active keep their access.
- Pending, invited and removed members take no seat. Removing someone frees theirs at once.

## Edge cases that are decided, and where they are tested

| Case | Decision |
|---|---|
| The ID token's `sub` and the online profile's id | The member is keyed by `sub`; a mismatch is logged (`member.user_id_mismatch`), never acted on |
| An email Shopify has not verified | Ignored: never matched to an invitation, never stored |
| Two requests for the same new person | One row: `create` conflicts, the loser reads again (`resolve-member.test.ts`, `members.test.ts`) |
| Two requests for the last seat | Exactly one is active, the other waits (`members.test.ts`, "never gives the last seat…") |
| Two owners demoting each other | The guard is a condition inside the same UPDATE (`notLastOwner`), so the last active owner always remains |
| An invitation for another shop, or taken twice | Never matched; taken once |
| A member acting on someone above their role, or on themselves | Refused (`forbidden`, `notYourself`) |
| A form with a forged role, id or intent | An error result, never a crash or another shop's row |
| A person kept out | Told why, and who to ask (the shop's active owners and admins, by name and address), on one screen |

## Known limits (honest, not hidden)

- **A person removed from the store in Shopify is not detected**: their membership stays active and keeps its seat until an
  owner removes it. The page shows when each person was last seen so an owner can tell. (Listing a store's staff needs a
  scope this template does not request.)
- **Collaborator accounts** (agencies) are stored (`collaborator`) but no rule reads it: they are ordinary members under the
  chosen policy. An app that treats them differently adds the rule in `member-admission.ts`.
- **Team changes are logged, not stored**: `member.role_changed | removed | approved | restored` carry the acting member's id
  and the shop's hash. An app that needs an audit table adds it beside `shop_members`.
- **No "request access" email yet**: a kept-out person is shown who to ask; nobody is notified.

## Writing a route

- Call `guardMember(request, permission)` instead of `authenticateAdmin`; it returns everything `authenticateAdmin` did,
  plus `member`. The server is the lock: a page also hides what a member cannot use, but only to be kind.
- Ask for the **permission the page needs**, not for a role. Never compare `member.role` in a route.
- The guard memoises per request, so the layout and its page cost one lookup.

## Verified, and not

Verified against shopify.dev (2026-11): the ID token's `sub` is the user; online tokens (`useOnlineTokens: true`) add
`associated_user` (`id`, `email` + `email_verified`, names, `account_owner`, `collaborator`) and expire after 24 hours or
on logout.

**Unverified — check before relying on it:**
- that `sub` and `associated_user.id` are the same value (the guard logs `member.user_id_mismatch` if they ever differ);
- that the first person to open the app on a store is the person who installed it;
- how Shopify marks an agency's collaborator account in practice (`collaborator` is stored; no rule reads it yet).
