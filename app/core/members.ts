import { defineMembers } from "@firesio/app/members";

/**
 * THE ONE PLACE an app decides how its members work (`@firesio/app/members`). The names every app shares are built in: the roles `owner` and
 * `admin` (everything; the first person on an account is an admin) and the permissions `app:view` (the way in, asked of every request),
 * `members:manage` (runs the team) and `billing:manage` (changes the plan; never given to a stranger). The person is read from one token exchange
 * (no online token), and a plan with fewer seats than people removes nobody at once: the owner has `seatGraceHours` (72) to choose who stays.
 * This file names only what is the app's own. Role and permission names are inferred from it, so a typo elsewhere does not compile;
 * `memberConfigProblems` is held to none by a test.
 */
const PERMISSIONS = ["app:manage"] as const;

export const MEMBERS = defineMembers({
  permissions: PERMISSIONS,
  // Most privileged first, after owner and admin: that order sorts the team. Every role carries `app:view`.
  roles: {
    member: ["app:view", "app:manage"],
    viewer: ["app:view"],
  },
  // A Shopify user who opens the app and is not a member yet: `auto` (joins with `joinRole`), `invite` (the default: kept out until invited) or `approval`.
  join: "auto",
  joinRole: "member",
});

/** Every permission the app's code names: the three built in and the app's own, read from the config. */
export type Permission = (typeof MEMBERS.permissions)[number];
