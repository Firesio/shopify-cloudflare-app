import { describe, expect, it } from "vitest";
import { decisionForVerdict } from "./decision";
import { SPAM_VERDICTS } from "./types";

describe("what a verdict means for a mail", () => {
  it("holds a mail the model is sure is spam", () => {
    expect(decisionForVerdict("spam")).toEqual({ action: "quarantine", reason: "ai_spam" });
  });

  it.each(SPAM_VERDICTS.filter((verdict) => verdict !== "spam"))("opens the conversation for %s", (verdict) => {
    expect(decisionForVerdict(verdict)).toEqual({ action: "open" });
  });

  it("opens the conversation when there is no verdict, so a model that is down never loses a customer's mail", () => {
    expect(decisionForVerdict(null)).toEqual({ action: "open" });
  });
});
