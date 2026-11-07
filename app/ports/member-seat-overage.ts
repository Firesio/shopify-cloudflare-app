/** The episode a shop has open, or had. Mirrors `member_seat_episodes`; holds no personal data. */
export interface SeatEpisode {
  readonly id: string;
  readonly shop: string;
  readonly detectedAt: number;
  readonly notifiedAt: number | null;
  readonly deadlineAt: number | null;
  readonly resolvedAt: number | null;
  readonly outcome: "cancelled" | "trimmed" | null;
  readonly trimmedCount: number | null;
}

/** Every method but `listDue` takes `shop` first: an episode id from anywhere is only ever read together with its shop. */
export interface MemberSeatEpisodes {
  /** The shop's open episode, if there is one. */
  findOpen(shop: string): Promise<SeatEpisode | undefined>;
  /**
   * Opens an episode, unless the shop already has one open: then that one is returned (`created: false`) and nothing is
   * written. Undefined only when the open one was resolved between the two steps; the caller simply tries again later.
   */
  open(shop: string, input: { readonly id: string; readonly now: number }): Promise<{ readonly episode: SeatEpisode; readonly created: boolean } | undefined>;
  /** Records that the notice was handed over and when the period ends. False when the episode is no longer open or was already notified. */
  markNotified(shop: string, id: string, input: { readonly notifiedAt: number; readonly deadlineAt: number }): Promise<boolean>;
  /** Closes an open episode. False when it was no longer open (another review closed it). */
  resolve(shop: string, id: string, input: { readonly outcome: "cancelled" | "trimmed"; readonly trimmedCount: number | null; readonly now: number }): Promise<boolean>;
  /**
   * The cron's list: shops with an open episode that still needs its notice, or whose deadline has passed. Reads across
   * shops on purpose; bounded by `limit`, in the order each became due (its deadline, or when it was detected if it was never notified).
   */
  listDue(now: number, limit: number): Promise<readonly string[]>;
}

/**
 * What the app may say about each person beyond their role, so that people with fewer privileges lose a seat first. OPTIONAL:
 * an app that supplies nothing is trimmed by role rank alone. A higher score is more privileged; a member left out of the
 * map is treated as the most privileged (protected), never as the least.
 */
export interface MemberPrivilege {
  scores(shop: string, ids: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

/** The shop as the review needs it. Undefined when the app holds no row for the shop. */
export interface SeatShopFacts {
  readonly installed: boolean;
  readonly name: string | null;
  /** The shop's own contact address, used only when no owner or admin has one. */
  readonly contactEmail: string | null;
  /** IANA zone the deadline is shown in; null reads as UTC. */
  readonly timeZone: string | null;
}

export interface SeatShops {
  facts(shop: string): Promise<SeatShopFacts | undefined>;
}

/** Where the scan of shops that could be over their limit stopped, so a bounded batch per tick eventually covers every shop. */
export interface SeatScanCursor {
  read(): Promise<string | null>;
  write(cursor: string | null, now: number): Promise<void>;
}
