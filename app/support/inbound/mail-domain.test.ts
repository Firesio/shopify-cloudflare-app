import { describe, expect, it } from "vitest";
import { supportEmailFor, supportMailDomain } from "./mail-domain";

describe("supportMailDomain", () => {
  it("is the app's own host, lower-cased, without port or path", () => {
    expect(supportMailDomain("https://VIP.firesio.app/app?x=1")).toBe("vip.firesio.app");
    expect(supportMailDomain("https://vip.firesio.app:8443")).toBe("vip.firesio.app");
  });

  it("uses a well-formed override where the app URL cannot say, and ignores a malformed one", () => {
    expect(supportMailDomain("http://localhost:5179", "Vip.Firesio.App")).toBe("vip.firesio.app");
    expect(supportMailDomain("https://vip.firesio.app", "other.firesio.app")).toBe("other.firesio.app");
    for (const bad of ["", "  ", "localhost", "not a host", "a@b.example", "https://x.example"]) {
      expect(supportMailDomain("https://vip.firesio.app", bad), bad).toBe("vip.firesio.app");
      expect(supportMailDomain("http://localhost:5179", bad), bad).toBeNull();
    }
  });

  it("is null where mail cannot arrive", () => {
    for (const url of [
      "http://localhost:3000",
      "https://shop.localhost",
      "https://my-app.workers.dev",
      "https://abc.trycloudflare.com",
      "http://127.0.0.1:8787",
      "https://printer.local",
      "https://intranet",
      "not a url",
      "",
    ]) {
      expect(supportMailDomain(url), url).toBeNull();
    }
  });
});

describe("supportEmailFor", () => {
  it("is support@ on the mail domain, or null where there is none", () => {
    expect(supportEmailFor("https://vip.firesio.app")).toBe("support@vip.firesio.app");
    expect(supportEmailFor("http://localhost:5179", "vip.firesio.app")).toBe("support@vip.firesio.app");
    expect(supportEmailFor("http://localhost:5179")).toBeNull();
  });
});
