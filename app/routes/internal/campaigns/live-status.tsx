import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { Spinner } from "~/internal/components/ui/spinner";
import { MAX_POLLS, POLL_INTERVAL_MS, nextPoll } from "./polling";

/**
 * Keeps the page moving while a campaign is sending: it reloads the page's data every few seconds. Render it ONLY while
 * the campaign is sending: mounting starts the count, unmounting (the status changed, the page was left) ends it.
 */
export function LiveStatus() {
  const revalidator = useRevalidator();
  const [stopped, setStopped] = useState(false);
  const polls = useRef(0);
  const reloading = useRef(false);
  const { revalidate } = revalidator;

  useEffect(() => {
    reloading.current = revalidator.state !== "idle";
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const verdict = nextPoll({ polls: polls.current, hidden: document.hidden });
      if (verdict === "stop") {
        clearInterval(timer);
        setStopped(true);
      } else if (verdict === "poll" && !reloading.current) {
        polls.current += 1;
        void revalidate();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [revalidate]);

  return stopped ? (
    <p className="text-sm text-muted-foreground">{`Live updates stopped after ${(MAX_POLLS * POLL_INTERVAL_MS) / 60_000} minutes. Reload the page to keep watching.`}</p>
  ) : (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-3" />
      {`Updating every ${POLL_INTERVAL_MS / 1000} seconds while this page is open.`}
    </p>
  );
}
