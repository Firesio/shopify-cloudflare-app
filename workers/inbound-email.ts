import type { ParsedMail, ReceiveOutcome } from "@firesio/support";

/** Larger than any real conversation mail; beyond it the sender is told so. */
export const INBOUND_MAX_BYTES = 10 * 1024 * 1024;

export interface InboundEmailDependencies {
  /** Parse the raw message (`adapters/inbound-mail.ts`, handed in by the composition root); null for one with no usable sender. */
  readonly parse: (envelope: { readonly to: string; readonly raw: ReadableStream<Uint8Array> }) => Promise<ParsedMail | null>;
  readonly receive: (mail: ParsedMail) => Promise<ReceiveOutcome>;
  readonly log: (entry: { readonly event: string; readonly status: string }) => void;
}

/**
 * The Email Routing entry: parse, hand to the support inbox, answer.
 *
 * Answering is a decision about the SENDER: a mail we cannot read or cannot
 * store is rejected so they get a bounce they can act on, rather than being
 * accepted and silently lost. Mail we choose to ignore (an auto-reply, our own
 * domain) is accepted and dropped, because bouncing it would start the loop we
 * are avoiding.
 */
export async function handleInboundEmail(message: ForwardableEmailMessage, dependencies: InboundEmailDependencies): Promise<void> {
  if (message.rawSize > INBOUND_MAX_BYTES) {
    dependencies.log({ event: "support.inbound_mail", status: "too_large" });
    message.setReject("Message too large");
    return;
  }

  try {
    const mail = await dependencies.parse({
      to: message.to,
      raw: message.raw,
    });
    if (mail === null) {
      dependencies.log({ event: "support.inbound_mail", status: "unreadable" });
      message.setReject("Unreadable message");
      return;
    }
    const outcome = await dependencies.receive(mail);
    dependencies.log({ event: "support.inbound_mail", status: outcome.status });
  } catch (cause) {
    dependencies.log({ event: "support.inbound_mail", status: cause instanceof Error ? cause.name : "failed" });
    message.setReject("Temporary failure, please try again later");
  }
}
