import { describe, expect, it } from "vitest";
import { OPEN_CONVERSATION, SPAM_SCORE_HOLD_AT, decisionForSpamScore } from "./decision";

describe("what a spam score means for a mail", () => {
  it("holds a mail the model is sure about", () => {
    expect(decisionForSpamScore(0.99)).toEqual({ action: "quarantine", reason: "ai_spam" });
  });

  it("holds a mail scoring exactly the threshold, and opens the one just below it", () => {
    expect(decisionForSpamScore(SPAM_SCORE_HOLD_AT)).toEqual({ action: "quarantine", reason: "ai_spam" });
    expect(decisionForSpamScore(SPAM_SCORE_HOLD_AT - 0.001)).toEqual(OPEN_CONVERSATION);
  });

  it.each([0, 0.02, 0.5, 0.85])("opens the conversation for a score of %s", (score) => {
    expect(decisionForSpamScore(score)).toEqual(OPEN_CONVERSATION);
  });

  it("opens the conversation when there is no answer, so a model that is down never costs a customer's mail", () => {
    expect(decisionForSpamScore(null)).toEqual(OPEN_CONVERSATION);
  });
});
