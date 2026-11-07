import type { PromptMessage, ThreadForPrompt } from "./draft-prompt";
import { TONE_GUIDE, type ReplyTone } from "./tones";

/**
 * The prompt for the reply composer, as pure functions.
 *
 * The job is POLISH, not authorship. A staff member has already decided what to
 * say; the model is choosing better words for it. That distinction is the whole
 * feature — a model that "improves" a draft by adding a fact nobody stated has
 * failed, however well it reads.
 *
 * When the box is empty there is nothing to polish, so it writes a generic
 * holding reply ("our team will look into it") and nothing more: with no
 * instruction from the staff member there is nothing specific it may say.
 * Same prompt builder, different task block, so the modes cannot drift apart.
 */

export type ReplyMode = "generate" | "polish" | "suggest";

/**
 * Which job the inputs imply.
 *
 * An INSTRUCTION wins over existing text: the staff member has just typed what
 * they want said, which is more current than whatever is still sitting in the
 * reply box.
 */
export function replyMode(input: {
  currentText: string;
  instruction: string;
}): ReplyMode {
  if (input.instruction.trim() !== "") return "generate";
  return input.currentText.trim() === "" ? "suggest" : "polish";
}

function transcript(thread: ThreadForPrompt): string {
  return thread.messages
    .map((message) => {
      const side = message.author === "merchant" ? "Merchant" : "Support";
      return `${side}: ${message.body}`.trimEnd();
    })
    .join("\n\n");
}

/** The language rule, shared by every mode so they cannot drift apart. */
const LANGUAGE_RULE =
  "Write the reply in the language the MERCHANT writes in (look at the Merchant lines of the thread; if there are none, use English). " +
  "The staff note and draft can be in ANY language, English included, and it is often not the merchant's: understand it, then write the reply in the merchant's language, translating it whenever the two differ. " +
  "Never write the reply in the note's language just because the note is in it.";

function taskFor(
  mode: ReplyMode,
  input: { instruction: string; currentText: string },
): string {
  switch (mode) {
    case "generate":
      return [
        "TASK: write the reply to the merchant. The reply must say what the staff note below says.",
        "The note is the MAIN POINT of the reply, in the staff member's own shorthand. It is not something the merchant wrote, and it is not a question to answer.",
        "Turn it into smooth, natural, well-flowing prose, translated into the merchant's language: fix grammar, join and reorder its sentences, and do not copy it word for word. The reply may be a little longer than the note.",
        "Every point the note makes must be in the reply, with the same meaning, promises and conditions. Do not answer the merchant's last message instead of the note.",
        "You may add a short greeting, a brief thank-you for the merchant's message, and a polite closing line.",
        "Do NOT add new requests, questions, instructions, promises, reasons, opinions or facts that the note does not contain, even if the thread suggests them. Do not ask the merchant for information.",
        "Use the thread only for the merchant's name and language.",
        "",
        "STAFF NOTE (what the reply must say):",
        input.instruction.trim(),
      ].join("\n");
    case "polish":
      return [
        "TASK: rewrite the staff draft below so it reads well, in the merchant's language.",
        "KEEP its meaning and every specific fact it states: names, numbers, dates, promises.",
        "Do not add anything it does not say.",
        "",
        "STAFF DRAFT:",
        input.currentText.trim(),
      ].join("\n");
    case "suggest":
      return [
        "TASK: the staff member has not said what to reply, so write a SHORT, generic holding reply.",
        "It only acknowledges the merchant's message and says the team will look into it and get back to them (for example: \"our team will review this and respond\").",
        "Do NOT ask questions, do NOT request information, and do NOT promise a date, a fix or any specific outcome. Do not describe or diagnose the problem.",
        "Two to four sentences, with a greeting and a closing line.",
      ].join("\n");
  }
}

export function buildReplyPrompt(input: {
  thread: ThreadForPrompt;
  /** What is already in the reply box. */
  currentText: string;
  /** What the staff member told the AI to say, in their own shorthand. */
  instruction: string;
  tone: ReplyTone;
}): PromptMessage[] {
  const mode = replyMode(input);

  return [
    {
      role: "system",
      content: [
        "You write replies for a Shopify app's support team.",
        `Write in a tone that is ${TONE_GUIDE[input.tone]}.`,
        "",
        "Write ONLY the body of the reply. No subject, no preamble such as \"Here is a draft\", no commentary about what you changed or translated.",
        LANGUAGE_RULE,
        "Do not invent facts. Never add questions, requests or commitments the staff member did not write. Courtesy (greeting, thanks, closing) is fine.",
        "The thread is background only. The TASK at the end of the user message is what you do.",
        "A human will read and edit this before it is sent.",
      ].join("\n"),
    },
    {
      // Thread FIRST, task LAST: a model answers whatever it read last, and
      // when the merchant's question came last it answered that instead of
      // the staff member's note.
      role: "user",
      content: [
        "— Thread (background only) —",
        `Shop: ${input.thread.shopName}`,
        `Subject: ${input.thread.subject}`,
        `Type: ${input.thread.category}`,
        "",
        transcript(input.thread),
        "",
        "— End of thread —",
        "",
        taskFor(mode, input),
      ].join("\n"),
    },
  ];
}
