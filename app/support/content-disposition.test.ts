import { describe, expect, it } from "vitest";
import { contentDisposition, dispositionFor } from "./content-disposition";

describe("contentDisposition", () => {
  it("sends an ASCII name and the same name as an extended value", () => {
    expect(contentDisposition("attachment", "orders.csv")).toBe(`attachment; filename="orders.csv"; filename*=UTF-8''orders.csv`);
  });

  it("encodes a non-Latin name per RFC 8187 and gives old clients an ASCII fallback", () => {
    expect(contentDisposition("attachment", "注文.csv")).toBe(`attachment; filename="__.csv"; filename*=UTF-8''%E6%B3%A8%E6%96%87.csv`);
    expect(contentDisposition("inline", "Скрин.png")).toBe(`inline; filename="_____.png"; filename*=UTF-8''%D0%A1%D0%BA%D1%80%D0%B8%D0%BD.png`);
  });

  it("escapes the characters encodeURIComponent leaves bare but RFC 8187 does not allow", () => {
    expect(contentDisposition("attachment", "it's (1)*!.txt")).toContain(`filename*=UTF-8''it%27s%20%281%29%2A%21.txt`);
  });

  it("never lets a quote, backslash or control character into the quoted fallback", () => {
    const header = contentDisposition("attachment", 'a"b\\c\r\nd.png');
    const fallback = /filename="([^"]*)"/.exec(header)?.[1];
    expect(fallback).toBe("a_b_c__d.png");
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("falls back to a placeholder when nothing printable is left", () => {
    expect(contentDisposition("attachment", "注文")).toContain('filename="file"');
  });
});

describe("dispositionFor", () => {
  it("renders images and video in place and downloads everything else", () => {
    expect(dispositionFor("image/png")).toBe("inline");
    expect(dispositionFor("video/mp4")).toBe("inline");
    expect(dispositionFor("text/csv")).toBe("attachment");
    expect(dispositionFor("application/pdf")).toBe("attachment");
    expect(dispositionFor("")).toBe("attachment");
  });
});
