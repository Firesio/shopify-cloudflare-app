import { useEffect, useRef } from "react";
import { revealFirstError } from "./first-error";

/**
 * After a refused answer, takes the merchant to the first field with an error under `root()` (else the critical
 * banner), once per answer: `answer` is a new object for every completed submission, as `useActionData` and a
 * fetcher's `data` are. For a form without a save bar; `FormSaveBar` does the same for its own form.
 */
export function useRevealFirstError(
  root: () => Element | null,
  answer: unknown,
  refused: boolean,
): void {
  const seen = useRef<unknown>(undefined);
  useEffect(() => {
    if (typeof answer !== "object" || answer === null) return;
    if (answer === seen.current) return;
    seen.current = answer;
    const element = root();
    if (refused && element !== null) {
      revealFirstError(element, { reducedMotion: prefersReducedMotion() });
    }
  }, [root, answer, refused]);
}

export function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}
