import { useState } from "react";
import { useFetcher } from "react-router";
import type { ThreadMessage } from "~/components/support/Thread";
import { shouldRefreshLinks, withFreshLinks } from "~/support/link-refresh";

type LinksResponse = { readonly links?: readonly { readonly id: string; readonly url: string }[] };

/**
 * Re-signs a thread's attachment links when one fails to load.
 *
 * The links are signed by the loader and last an hour. A fetcher asks the SAME loader for new ones (`?links=1`), which
 * answers without streaming and without marking the thread read, so the page does not remount: the reply the merchant
 * is typing is untouched. The new links apply only to the messages they were requested for; a later full load brings its
 * own freshly signed set.
 */
export function useFreshLinks(ticketId: string, messages: readonly ThreadMessage[]) {
  const fetcher = useFetcher<LinksResponse>();
  const [requestedFor, setRequestedFor] = useState<readonly ThreadMessage[] | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const links = requestedFor === messages ? fetcher.data?.links : undefined;

  return {
    messages: links ? withFreshLinks(messages, links) : messages,
    onMediaError: () => {
      const now = Date.now();
      if (!shouldRefreshLinks({ lastRefreshAt, now })) return;
      setLastRefreshAt(now);
      setRequestedFor(messages);
      void fetcher.load(`/app/support/${encodeURIComponent(ticketId)}?links=1`);
    },
  };
}
