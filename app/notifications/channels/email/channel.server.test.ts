import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { EmailChannel } from "./channel.server";
import type { EmailMessage } from "../../types";

const message = (over: Partial<EmailMessage> = {}): EmailMessage => ({
  kind: "email",
  to: "jane@buyer.test.org",
  subject: "Re: Help",
  html: "<p>Hi</p>",
  text: "Hi",
  ...over,
});

/** The binding is the outermost boundary: a fake that records what would go on the wire. */
function runWith(vars: { EMAIL_FROM: string; EMAIL_FROM_NAME?: string }, send: EmailMessage) {
  const sent: unknown[] = [];
  const binding: SendEmail = {
    send: async (builder: unknown) => { sent.push(builder); return { messageId: "id-1" }; },
  };
  // Env types the configured sender as the empty string it ships with, so the
  // override goes through a copy typed for exactly the fields it changes.
  const testEnv: Env = Object.assign(Object.create(Object.getPrototypeOf(env)), env, vars, { EMAIL: binding });
  const outcome = runWithRequestContext(testEnv, () => new EmailChannel().send(send, {}));
  return { sent, outcome };
}

describe("EmailChannel sender", () => {
  it("sends from the app's default address unless the message names its own", async () => {
    const plain = runWith({ EMAIL_FROM: "notifications@vip.firesio.app", EMAIL_FROM_NAME: "Vip" }, message());
    await plain.outcome;
    expect(plain.sent[0]).toMatchObject({ from: { email: "notifications@vip.firesio.app", name: "Vip" } });

    const conversation = runWith(
      { EMAIL_FROM: "notifications@vip.firesio.app", EMAIL_FROM_NAME: "Vip" },
      message({ from: "support@vip.firesio.app", replyTo: "support+abcd1234@vip.firesio.app", headers: { "In-Reply-To": "<a@x>" } }),
    );
    await conversation.outcome;
    expect(conversation.sent[0]).toMatchObject({
      from: { email: "support@vip.firesio.app", name: "Vip" },
      replyTo: "support+abcd1234@vip.firesio.app",
      headers: { "In-Reply-To": "<a@x>" },
    });
  });

  it("sends nothing at all when email is not set up, whatever sender the message names", async () => {
    const off = runWith({ EMAIL_FROM: "" }, message({ from: "support@vip.firesio.app" }));
    expect(await off.outcome).toMatchObject({ status: "refused", reason: "channel_unavailable" });
    expect(off.sent).toHaveLength(0);
  });
});
