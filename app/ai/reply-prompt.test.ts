import { describe, it, expect } from "vitest";
import { buildReplyPrompt, replyMode } from "./reply-prompt";
import { TONE_GUIDE } from "./tones";

const thread = {
  subject: "Checkout is broken",
  shopName: "Alpha Store",
  category: "bug" as const,
  messages: [
    { author: "merchant" as const, authorName: "Alpha Store", body: "Payment fails at the last step." },
  ],
};

const user = (messages: { role: string; content: string }[]) => messages.at(-1)?.content ?? "";
const system = (messages: { role: string; content: string }[]) => messages[0]?.content ?? "";

describe("which job the model is being asked to do", () => {
  it("is generate when the staff member said what to say", () => {
    // An instruction beats existing text: they have just told us what they
    // want, which is more current than whatever is still in the box.
    expect(replyMode({ currentText: "old text", instruction: "tell them Friday" })).toBe("generate");
  });

  it("is polish when there is text and no instruction", () => {
    expect(replyMode({ currentText: "We are looking into it", instruction: "" })).toBe("polish");
  });

  it("is suggest when there is neither", () => {
    expect(replyMode({ currentText: "", instruction: "" })).toBe("suggest");
    expect(replyMode({ currentText: "  \n ", instruction: "   " })).toBe("suggest");
  });
});

describe("generating from an instruction", () => {
  const messages = buildReplyPrompt({
    thread,
    currentText: "",
    instruction: "tell them the fix ships Friday and apologise for the delay",
    tone: "professional",
  });

  it("turns the instruction into the message", () => {
    expect(user(messages)).toContain("ships Friday");
  });

  it("keeps the note's points, allows courtesy, forbids new content", () => {
    const text = user(messages).toLowerCase();
    expect(text).toMatch(/do not copy it word for word/);
    expect(text).toMatch(/thank-you/);
    expect(text).toMatch(/do not add new requests/);
  });

  it("still carries the thread for context", () => {
    expect(user(messages)).toContain("Payment fails at the last step.");
  });

  it("puts the note AFTER the thread, so the merchant's last message is not what gets answered", () => {
    const text = user(messages);
    expect(text.indexOf("ships Friday")).toBeGreaterThan(text.indexOf("Payment fails at the last step."));
  });

  it("translates a note written in another language into the merchant's language", () => {
    const viet = buildReplyPrompt({
      thread,
      currentText: "",
      instruction: "Trả lời họ là mình vừa upgrade shopify api, sẽ deploy vài ngày tới",
      tone: "friendly",
    });
    expect(user(viet)).toContain("Trả lời họ là mình vừa upgrade shopify api");
    expect(system(viet).toLowerCase()).toMatch(/language the merchant writes in/);
  });

  it("translates a note written in English too, when the merchant writes another language", () => {
    const spanishThread = {
      ...thread,
      messages: [{ author: "merchant" as const, authorName: "Tienda", body: "El pago falla en el último paso." }],
    };
    const messages = buildReplyPrompt({
      thread: spanishThread,
      currentText: "",
      instruction: "tell them the fix ships Friday",
      tone: "professional",
    });
    // The rule names no language: it is "the merchant's", whatever the note is in.
    expect(system(messages).toLowerCase()).toMatch(/any language, english included/);
    expect(system(messages).toLowerCase()).toMatch(/translating it whenever the two differ/);
    expect(user(messages)).toContain("El pago falla");
  });

  it("forbids asking the merchant anything the note did not say", () => {
    expect(user(messages).toLowerCase()).toMatch(/do not ask the merchant for information/);
  });
});

describe("polishing what a staff member wrote", () => {
  const messages = buildReplyPrompt({
    thread,
    currentText: "we r looking at it, prob the card thing. will update u",
    instruction: "",
    tone: "professional",
  });

  it("sends the staff member's own words to be rewritten", () => {
    expect(user(messages)).toContain("we r looking at it");
  });

  it("tells the model to KEEP the meaning rather than write something new", () => {
    // The staff member decided what to say; the model is only choosing better
    // words for it. Losing a stated fact is this feature's worst failure.
    expect(user(messages).toLowerCase()).toMatch(/keep|preserve/);
  });

  it("forbids inventing facts the draft did not state", () => {
    expect(system(messages).toLowerCase()).toMatch(/do not invent|never invent/);
  });

  it("still includes the thread, so the rewrite has context", () => {
    expect(user(messages)).toContain("Payment fails at the last step.");
  });

  it("asks for only the message body", () => {
    expect(system(messages).toLowerCase()).toContain("only");
  });
});

describe("a generic holding reply when nothing is written yet", () => {
  const messages = buildReplyPrompt({ thread, currentText: "", instruction: "", tone: "professional" });

  it("asks only for a generic acknowledgement that the team will look into it", () => {
    expect(user(messages).toLowerCase()).toMatch(/generic holding reply/);
    expect(user(messages).toLowerCase()).toMatch(/team will look into it/);
  });

  it("forbids questions, requests and promised outcomes", () => {
    expect(user(messages).toLowerCase()).toMatch(/do not ask questions/);
    expect(user(messages).toLowerCase()).toMatch(/do not promise a date, a fix/);
  });

  it("does not claim the staff member wrote something", () => {
    expect(user(messages).toLowerCase()).not.toMatch(/keep its meaning/);
  });

  it("still carries the thread", () => {
    expect(user(messages)).toContain("Payment fails at the last step.");
  });
});

describe("tone", () => {
  it.each(["professional", "friendly", "short"] as const)(
    "puts the %s guide in the system message",
    (tone) => {
      const messages = buildReplyPrompt({ thread, currentText: "hi", instruction: "", tone });
      expect(system(messages)).toContain(TONE_GUIDE[tone]);
    },
  );

  it("changes the prompt when the tone changes", () => {
    // If it did not, the tone control would be decoration.
    const a = buildReplyPrompt({ thread, currentText: "hi", instruction: "", tone: "professional" });
    const b = buildReplyPrompt({ thread, currentText: "hi", instruction: "", tone: "short" });
    expect(system(a)).not.toBe(system(b));
  });
});
