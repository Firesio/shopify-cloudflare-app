import type { NotificationEvent } from "~/notifications/types";
import type { HandoffNotifier, Notifier, NotifyRequest } from "~/ports/notifier";

/**
 * A `Notifier` that sends nothing and remembers everything.
 *
 * The fake sits at the PORT, which is the outermost boundary for this effect —
 * not over a model, and not asserting on our own internals. An email leaves no
 * database state behind, so recording the request is the only honest way to
 * prove a use case asked for the right notification, to the right people, with
 * the right copy list.
 */
export interface FakeNotifier extends Notifier {
  readonly sent: NotifyRequest[];
  /** Every request for one event, in the order they were made. */
  forEvent(event: string): NotifyRequest[];
  /** The single request for one event. Throws unless there is exactly one. */
  onlyFor(event: string): NotifyRequest;
}

export function fakeNotifier(): FakeNotifier {
  const sent: NotifyRequest[] = [];

  const forEvent = (event: string) => sent.filter((request) => request.event === event);

  return {
    sent,
    forEvent,
    onlyFor(event) {
      const matches = forEvent(event);
      if (matches.length !== 1) {
        throw new Error(
          `expected exactly one ${event} notification, got ${matches.length}`,
        );
      }
      // Guaranteed by the length check above; read this way rather than with a
      // non-null assertion, which @rules/core.md bans.
      const [only] = matches;
      if (!only) throw new Error("unreachable");
      return only;
    },
    async send(input) {
      sent.push(input);
      return undefined;
    },
  };
}

/**
 * A `HandoffNotifier` that remembers every request and can refuse them, like a queue that is down. `failing` is read at
 * each call, so a test can bring the queue back between two reviews.
 */
export interface FakeHandoffNotifier extends HandoffNotifier {
  readonly requests: NotifyRequest[];
  failing: boolean;
  /** The requests for one event, typed as that event's: its payload is the one that event carries. */
  forEvent<E extends NotificationEvent>(event: E): NotifyRequest<E>[];
}

/** A real check of the event, so a request found by event name carries that event's payload type. */
function isRequestFor<E extends NotificationEvent>(request: NotifyRequest, event: E): request is NotifyRequest<E> {
  return request.event === event;
}

export function fakeHandoffNotifier(): FakeHandoffNotifier {
  const notifier: FakeHandoffNotifier = {
    requests: [],
    failing: false,
    forEvent: (event) => notifier.requests.filter((request) => isRequestFor(request, event)),
    async handOff(input) {
      if (notifier.failing) return { queued: false };
      notifier.requests.push(input);
      return { queued: true };
    },
  };
  return notifier;
}
