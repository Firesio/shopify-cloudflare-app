import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePair, hasValue, withVapidPair } from "./seed-vapid-dev.mjs";

const PAIR = { publicKey: "PUB", privateKey: "PRIV" };

describe("hasValue", () => {
  it("sees a set value, with or without quotes and spaces", () => {
    assert.equal(hasValue("VAPID_PUBLIC_KEY=abc\n", "VAPID_PUBLIC_KEY"), true);
    assert.equal(hasValue('VAPID_PUBLIC_KEY = "abc"', "VAPID_PUBLIC_KEY"), true);
  });
  it("ignores comments, empty values and other names", () => {
    assert.equal(hasValue("# VAPID_PUBLIC_KEY=abc", "VAPID_PUBLIC_KEY"), false);
    assert.equal(hasValue("VAPID_PUBLIC_KEY=\n", "VAPID_PUBLIC_KEY"), false);
    assert.equal(hasValue('VAPID_PUBLIC_KEY=""', "VAPID_PUBLIC_KEY"), false);
    assert.equal(hasValue("VAPID_PUBLIC_KEY_OLD=abc", "VAPID_PUBLIC_KEY"), false);
  });
});

describe("withVapidPair", () => {
  it("appends the pair after existing content, keeping it intact", () => {
    const next = withVapidPair("A=1\nB=2\n", PAIR);
    assert.ok(next?.startsWith("A=1\nB=2\n"));
    assert.match(next, /^VAPID_PUBLIC_KEY=PUB$/m);
    assert.match(next, /^VAPID_PRIVATE_KEY=PRIV$/m);
  });
  it("handles a file with no trailing newline and an empty file", () => {
    assert.match(withVapidPair("A=1", PAIR), /^A=1\n/);
    assert.match(withVapidPair("", PAIR), /^VAPID_PUBLIC_KEY=PUB$/m);
  });
  it("never overwrites: any existing half of the pair means leave it alone", () => {
    assert.equal(withVapidPair("VAPID_PUBLIC_KEY=mine\n", PAIR), null);
    assert.equal(withVapidPair("VAPID_PRIVATE_KEY=mine\n", PAIR), null);
    assert.equal(withVapidPair("VAPID_PUBLIC_KEY=a\nVAPID_PRIVATE_KEY=b\n", PAIR), null);
  });
  it("treats commented or empty entries as not set", () => {
    assert.ok(withVapidPair("# VAPID_PUBLIC_KEY=x\nVAPID_PRIVATE_KEY=\n", PAIR));
  });
});

describe("generatePair", () => {
  it("makes a 65-byte public point and a 32-byte private scalar, base64url", async () => {
    const pair = await generatePair();
    assert.equal(Buffer.from(pair.publicKey, "base64url").length, 65);
    assert.equal(Buffer.from(pair.privateKey, "base64url").length, 32);
    assert.equal(Buffer.from(pair.publicKey, "base64url")[0], 4);
  });
});
