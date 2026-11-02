/**
 * How the progress page keeps itself current while a campaign is sending. PURE: the decision, with the bounds that
 * stop it (@rules/merchant-speed.md: never poll without a bound).
 */
export const POLL_INTERVAL_MS = 5_000;
/** 120 polls at 5 seconds is ten minutes; after that the page asks the person to reload instead of going on forever. */
export const MAX_POLLS = 120;

export type PollVerdict = "poll" | "skip" | "stop";

/** `skip` is a tick in a hidden tab: nothing is asked and it does not count against the ceiling. */
export function nextPoll(input: { readonly polls: number; readonly hidden: boolean }): PollVerdict {
  if (input.polls >= MAX_POLLS) return "stop";
  return input.hidden ? "skip" : "poll";
}
