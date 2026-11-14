/**
 * The ambient facts, read in ONE place: the clock, ids and random bytes. Lint bans `Date.now`, `new Date()` and
 * `crypto.randomUUID` everywhere else (`eslint.config.js`), so core and the adapters take them as arguments and tests fix them.
 */
export interface Runtime {
  readonly now: () => number;
  readonly date: () => Date;
  readonly uuid: () => string;
  readonly sleep: (ms: number) => Promise<void>;
}

export function systemRuntime(): Runtime {
  return {
    now: () => Date.now(),
    date: () => new Date(),
    uuid: () => crypto.randomUUID(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** One JSON line per event, the shape every log line in the app has: a stable `event` plus names and counts, never a body or an address. */
export function jsonLog(entry: Readonly<Record<string, unknown>>): void {
  console.log(JSON.stringify(entry));
}
