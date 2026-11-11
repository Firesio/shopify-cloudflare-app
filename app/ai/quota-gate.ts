import type { AiGate } from "./gate";
import type { ModelRole } from "./roles";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A spend cap on ONE purpose: refuse once it has run `perDay` times in the last 24 hours.
 *
 * For purposes whose callers are not people but traffic we do not control (an inbound-mail check runs once per
 * stranger's mail), so an attacker's flood cannot become our AI bill. A rolling window, not a calendar day: there
 * is no midnight at which a cap resets and a flood restarts. Refuses with `rate_limited`, which every feature
 * already treats as "AI is unavailable right now".
 *
 * `callsSince` and `now` are parameters, so the policy is testable with no database and no clock.
 */
export function dailyCallCap(options: {
  readonly role: ModelRole;
  readonly perDay: number;
  readonly callsSince: (role: ModelRole, since: number) => Promise<number>;
  readonly now: () => number;
}): AiGate {
  return {
    async refuse({ role }) {
      if (role !== options.role) return null;
      const calls = await options.callsSince(role, options.now() - DAY_MS);
      return calls >= options.perDay ? "rate_limited" : null;
    },
  };
}
