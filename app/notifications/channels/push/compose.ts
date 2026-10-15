import type { PayloadByEvent } from "../../payloads";
import type { NotificationEvent, PushMessage } from "../../types";
import { PUSH_BUILDERS } from "./builders";

/**
 * Turn an event and its payload into the push for one device.
 *
 * `to` is the push subscription id; copies do not exist for push, so there is no cc parameter. Eligibility refuses a
 * channel the catalogue does not list for the event, so a missing builder here is a broken invariant — a catalogue
 * entry without a builder — and throws rather than quietly sending nothing.
 */
export async function composePushMessage<E extends NotificationEvent>(
  event: E,
  payload: PayloadByEvent[E],
  to: string,
): Promise<PushMessage> {
  const build = PUSH_BUILDERS[event];
  if (build === null) throw new Error(`The catalogue lists push for ${event}, which has no push builder`);
  return { kind: "push", to, ...build(payload) };
}
