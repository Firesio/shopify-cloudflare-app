/**
 * The switches of the optional parts of the template, each ONE plain `export const`. Everything a switch needs is already written and sits in its
 * place; the switch only connects it, so a part that is off costs next to nothing: no route in the route table, no declaration in `createFiresio`,
 * and nothing of it fetched by the admin (the phone's shell is a `lazy()` chunk of its own, built apart and never requested until a paired phone
 * opens the app; `scripts/bundle-budget.mjs` measures both). `app/features.test.ts` holds each switch against the pieces it needs: turn one on and `npm run verify` names what is
 * missing; leave a piece connected while its switch is off and it names that too. One part is always on and needs no switch: POS
 * (`docs/POS-AND-PHONE.md` section 2). Campaigns are off (mail on consent needs a sender Cloudflare Email cannot be: `app/notifications/index.ts`).
 */

/** The staff phone app: an installed web app on a staff member's phone, paired with a short code (`docs/POS-AND-PHONE.md` section 3). Off: nothing of it is connected. */
export const PWA = false;
