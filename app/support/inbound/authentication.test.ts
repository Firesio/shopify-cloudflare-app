import { describe, expect, it } from "vitest";
import { dkimPassDomains } from "./authentication";

const header = (value: string) => ({ key: "authentication-results", value });

describe("dkimPassDomains", () => {
  it("reads the domains a trusted receiver saw pass", () => {
    const headers = [header("mx.trusted.example; dkim=pass header.i=@shopify.com header.s=m1; dkim=pass header.d=sendgrid.info; spf=pass")];
    expect(dkimPassDomains(headers, "mx.trusted.example")).toEqual(["shopify.com", "sendgrid.info"]);
  });
  it("ignores failures, other receivers and a forged header", () => {
    const headers = [
      header("mx.trusted.example; dkim=fail header.i=@shopify.com"),
      header("attacker.example; dkim=pass header.i=@shopify.com"),
    ];
    expect(dkimPassDomains(headers, "mx.trusted.example")).toEqual([]);
  });
  it("trusts nothing without a configured receiver, whatever the header says", () => {
    expect(dkimPassDomains([header("mx.trusted.example; dkim=pass header.i=@shopify.com")], "")).toEqual([]);
  });
  it("matches the receiver id case-insensitively", () => {
    expect(dkimPassDomains([header("MX.Trusted.Example; dkim=pass header.d=a.example")], "mx.trusted.example")).toEqual(["a.example"]);
  });
});
