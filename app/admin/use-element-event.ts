import { useEffect, useRef, type RefObject } from "react";

/**
 * Listens for a DOM event on a Polaris custom element.
 *
 * Why not an `on*` prop: on a custom element React 19 only delivers events that bubble and carry a DOM event name
 * (`onClick`, `onInput` and `onChange` work when the element's event bubbles; checked in jsdom with React 19.3). An event
 * that does not bubble or has a name of its own (`dismiss`, `droprejected`, `error`) never reaches the prop, so listen on
 * the element itself, the same way `CcEmails` listens for `keydown`.
 *
 * The handler is read through a ref, so a new function each render does not re-attach the listener.
 */
export function useElementEvent(ref: RefObject<EventTarget | null>, type: string, handler: (event: Event) => void): void {
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const listener = (event: Event) => latest.current(event);
    element.addEventListener(type, listener);
    return () => element.removeEventListener(type, listener);
  }, [ref, type]);
}
