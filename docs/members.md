# Members — edge cases, known limits, verification

Reference for `.claude/rules/members.md` and `.claude/rules/members-seats.md`. Not loaded automatically.

## File map

| Decision | File | Ring |
|---|---|---|
| Permissions, roles, `can`, `canAssignRole` (the owner-only rule lives here) | `app/domain/member-access.ts` | 1 |
| A membership's lifecycle (`invited / pending / active / removed`) | `app/domain/member-lifecycle.ts` | 1 |
| Who gets in: the fixed rules, then the app's policy for strangers | `app/domain/member-admission.ts` | 1 |
| **The app's choices** (policy, default role, online tokens) | `app/members/config.ts` | config |
| The seat limit: reading it from the plan, the cap a write is given, the STRICT reading used to take a seat away, and the DISPLAY reading (`seatReadingFrom`) | `app/domain/member-seats.ts`, `app/adapters/member-seats.server.ts` | 1, 4 |
| What happens when the team is over the plan's seats (policy, episode, who goes first, who is told) | `app/domain/member-seat-overage.ts` | 1 |
| The team as the page shows it: order, what a row offers, contacts to ask, the seat summary and the seat answer for letting someone in, the two notices and the cap's hidden count | `app/domain/member-team.ts` | 1 |
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
| Cancelling an invitation | The row is deleted (shop-scoped, one statement); no seat, nothing to restore, the address can be invited again; another shop's invitation id is `notFound` | S, M, I |
| A row with no Shopify user (old cancelled invitation, or anything else) offered for approve/restore, or activated | Never: `canOf` offers neither, `activate` refuses it in its own statement, `remove` will not park it; it is also out of the list and counts and its page is a 404 | T, S, M, I |
| An invitation taken up while its owner was cancelling it | `invalidState`; the person stays | M |
| Plan cannot be read | The page says so ("unknown"); no "N of 0 / over the limit"; letting in is disabled with the reason; admission still gives no new seat | `member-seats.test.ts`, T, I |
| No seat free for a waiting or removed person | The let-in/restore button is disabled with the reason; the server's `noSeat` agrees | T, I |
| People waiting vs. people who lost a seat | Counted apart (from the stored counts, not the capped list); a different banner for each | S, T, I |
| More than 500 people | The list is read up to 500 and says how many it left out | I |
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
  (`docs/shopify-api-invariants.md`); a collaborator who is not flagged is taken for staff.
- **"Someone has opened the app" is read from membership rows.** Under `invite_only` a turned-away collaborator leaves no row,
  so the next non-collaborator stranger still becomes the first admin. That is deliberate: under `invite_only` nobody can be
  invited until a member exists, so the first admitted person has to be that admin.
- **A team without an owner is valid and common** (every first-user shop starts without one). Only Shopify's account owner
  opening the app, or an existing owner, creates one.
- **Team changes are logged, not stored**: `member.role_changed | removed | invitation_cancelled | approved | restored | permissions_changed` (the last names the permissions added and taken away) carry the acting member's id
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


## Verified, and not

Verified against shopify.dev (2026-11; `account_owner` and `collaborator` definitions re-read 2026-11-07): the ID token's `sub` is the user; online tokens (`useOnlineTokens: true`) add
`associated_user` (`id`, `email` + `email_verified`, names, `account_owner`, `collaborator`) and expire after 24 hours or
on logout.

Session storage keeps that profile: `KVSessionStorage` writes the session with `toPropertyArray(true)` and reads it with `fromPropertyArray(raw, true)`
(the library drops `account_owner`, email, names and `collaborator` otherwise, so only the request that minted a session would know who the person
is). The shop-index entry's metadata stays free of personal data. See `docs/shopify-api-invariants.md`, "Who is using the app: members".

**Unverified — check before relying on it:**
- that `sub` and `associated_user.id` are the same value (the guard logs `member.user_id_mismatch` if they ever differ);
- that the first person to open the app on a store is someone who should run its team ("first user is admin" is OUR
  decision, not Shopify's; the account owner is made an owner whenever they open the app, so the store gets its owner anyway);
- how Shopify marks an agency's collaborator account in practice (only its one-line definition is known; a collaborator who is
  not flagged is taken for staff and could be the first admin).

