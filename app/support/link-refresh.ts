/**
 * When to ask for freshly signed attachment links.
 *
 * A link lasts an hour. A file that fails to load usually means it ran out, so the page asks for new ones, but not in a
 * loop: a file that is genuinely gone would fail again and ask again. At most once per gap.
 */
export const LINK_REFRESH_MIN_GAP_MS = 5 * 60 * 1000;

export function shouldRefreshLinks(input: { readonly lastRefreshAt: number | null; readonly now: number }): boolean {
  return input.lastRefreshAt === null || input.now - input.lastRefreshAt >= LINK_REFRESH_MIN_GAP_MS;
}

/** A thread's messages with each attachment's link swapped for its fresh one; everything else is untouched. */
export function withFreshLinks<M extends { readonly attachments: readonly { readonly id: string; readonly url: string }[] }>(
  messages: readonly M[],
  links: readonly { readonly id: string; readonly url: string }[],
): M[] {
  const urlById = new Map(links.map((link) => [link.id, link.url]));
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments.map((file) => ({ ...file, url: urlById.get(file.id) ?? file.url })),
  }));
}
