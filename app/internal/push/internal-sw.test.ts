import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The service worker is plain JS served as a static file, so it is tested by
 * loading its exact text and running it against a hand-made `self`. Nothing in
 * the worker is replaced: the fake only records what the worker asks the
 * browser to do (show a notification, open a window, POST a subscription).
 */
const SOURCE = readFileSync(path.resolve(import.meta.dirname, "../../../public/internal-sw.js"), "utf8");
const ORIGIN = "https://console.workmanjsc.vn";

interface FakeClient {
  readonly url: string;
  readonly focused: string[];
  readonly navigated: string[];
  readonly navigateFails?: boolean;
  focus(): Promise<FakeClient>;
  navigate(url: string): Promise<FakeClient>;
}

function client(url: string, navigateFails = false): FakeClient {
  const self: FakeClient = {
    url,
    focused: [],
    navigated: [],
    navigateFails,
    focus() {
      self.focused.push("focus");
      return Promise.resolve(self);
    },
    navigate(target) {
      if (navigateFails) return Promise.reject(new TypeError("not controlled"));
      self.navigated.push(target);
      return Promise.resolve(self);
    },
  };
  return self;
}

interface Shown {
  readonly title: string;
  readonly options: Record<string, unknown>;
}

interface Posted {
  readonly url: string;
  readonly init: RequestInit;
}

function boot(windows: readonly FakeClient[] = []) {
  const listeners = new Map<string, (event: unknown) => void>();
  const shown: Shown[] = [];
  const opened: string[] = [];
  const posted: Posted[] = [];
  const subscribed: unknown[] = [];
  const calls: string[] = [];

  const fakeSelf = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: () => {
      calls.push("skipWaiting");
      return Promise.resolve();
    },
    clients: {
      claim: () => {
        calls.push("claim");
        return Promise.resolve();
      },
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
      pushManager: {
        subscribe: (options: unknown) => {
          subscribed.push(options);
          return Promise.resolve({ toJSON: () => ({ endpoint: "https://push.invalid/new", keys: { p256dh: "p", auth: "a" } }) });
        },
      },
    },
    fetch: (url: string, init: RequestInit) => {
      posted.push({ url, init });
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  };

  new Function("self", SOURCE)(fakeSelf);

  /** Fires an event and resolves once everything the worker passed to waitUntil has settled. */
  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`the worker has no ${type} listener`);
    const pending: Promise<unknown>[] = [];
    listener({ waitUntil: (promise: Promise<unknown>) => pending.push(promise), ...extra });
    await Promise.all(pending);
  }

  return { dispatch, listeners, shown, opened, posted, subscribed, calls };
}

function pushWith(json: unknown) {
  return { data: { json: () => json } };
}

describe("lifecycle", () => {
  it("takes over immediately: skipWaiting on install, clients.claim on activate", async () => {
    const worker = boot();
    await worker.dispatch("install");
    await worker.dispatch("activate");
    expect(worker.calls).toEqual(["skipWaiting", "claim"]);
  });
});

describe("push", () => {
  it("shows the title, body, icons and tag, and collapses duplicates with renotify", async () => {
    const worker = boot();
    await worker.dispatch(
      "push",
      pushWith({ title: "New ticket", body: "Shop A needs help", url: "/internal/support/7", tag: "ticket-7", topic: "support_ticket_opened" }),
    );

    expect(worker.shown).toHaveLength(1);
    const [only] = worker.shown;
    expect(only?.title).toBe("New ticket");
    expect(only?.options).toMatchObject({
      body: "Shop A needs help",
      icon: "/internal-icons/icon-192.png",
      badge: "/internal-icons/badge.png",
      tag: "ticket-7",
      renotify: true,
      data: { url: `${ORIGIN}/internal/support/7`, topic: "support_ticket_opened" },
    });
  });

  it("omits renotify when there is no tag (the browser rejects renotify without one)", async () => {
    const worker = boot();
    await worker.dispatch("push", pushWith({ title: "Hello", body: "x" }));
    const options = worker.shown[0]?.options ?? {};
    expect("tag" in options).toBe(false);
    expect("renotify" in options).toBe(false);
  });

  it.each([
    ["no data at all", {}],
    ["data that is not JSON", { data: { json: () => { throw new SyntaxError("bad json"); } } }],
    ["JSON that is not an object", pushWith("just a string")],
    ["JSON null", pushWith(null)],
    ["a JSON array", pushWith(["a"])],
    ["an object with the wrong field types", pushWith({ title: 5, body: { a: 1 }, url: 9, tag: [] })],
  ])("still shows a generic notification for %s (push requires every push to be visible)", async (_name, event) => {
    const worker = boot();
    await worker.dispatch("push", event);
    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]?.title).toBe("New notification");
    expect(worker.shown[0]?.options).toMatchObject({ body: "", data: { url: `${ORIGIN}/internal/dashboard` } });
  });

  it("falls back to the dashboard for a push url it must never open", async () => {
    const worker = boot();
    await worker.dispatch("push", pushWith({ title: "t", url: "https://evil.example/phish" }));
    expect(worker.shown[0]?.options).toMatchObject({ data: { url: `${ORIGIN}/internal/dashboard` } });
  });

  it("bounds an oversized title and body", async () => {
    const worker = boot();
    await worker.dispatch("push", pushWith({ title: "t".repeat(1000), body: "b".repeat(5000) }));
    expect(worker.shown[0]?.title).toHaveLength(120);
    expect(String(worker.shown[0]?.options["body"])).toHaveLength(300);
  });
});

describe("notificationclick", () => {
  function clickEvent(url: unknown) {
    const closed: string[] = [];
    return {
      closed,
      event: {
        notification: { close: () => closed.push("closed"), data: url === undefined ? undefined : { url } },
      },
    };
  }

  it("closes the notification and focuses + navigates an existing console window", async () => {
    const other = client(`${ORIGIN}/app`);
    const consoleWindow = client(`${ORIGIN}/internal/shops`);
    const worker = boot([other, consoleWindow]);
    const { closed, event } = clickEvent(`${ORIGIN}/internal/support/7`);

    await worker.dispatch("notificationclick", event);

    expect(closed).toEqual(["closed"]);
    expect(consoleWindow.focused).toEqual(["focus"]);
    expect(consoleWindow.navigated).toEqual([`${ORIGIN}/internal/support/7`]);
    expect(other.navigated).toEqual([]);
    expect(worker.opened).toEqual([]);
  });

  it("opens a new window when no console window is open", async () => {
    const worker = boot([client(`${ORIGIN}/pricing`), client("https://elsewhere.example/internal/x")]);
    await worker.dispatch("notificationclick", clickEvent(`${ORIGIN}/internal/support/7`).event);
    expect(worker.opened).toEqual([`${ORIGIN}/internal/support/7`]);
  });

  it("opens a new window when the existing one cannot be navigated", async () => {
    const worker = boot([client(`${ORIGIN}/internal/shops`, true)]);
    await worker.dispatch("notificationclick", clickEvent(`${ORIGIN}/internal/support/7`).event);
    expect(worker.opened).toEqual([`${ORIGIN}/internal/support/7`]);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["another origin", "https://evil.example/internal/support"],
    ["a protocol-relative url", "//evil.example/internal/x"],
    ["path traversal out of /internal/", "/internal/../x"],
    ["encoded path traversal", "/internal/%2e%2e/app"],
    ["a backslash host trick", "/\\evil.example/internal/x"],
    ["a data: url", "data:text/html,<script>1</script>"],
    ["a sibling path that only shares the prefix", "/internal-sw.js"],
    ["the merchant admin", "/app/billing"],
    ["an empty string", ""],
    ["a non-string", 42],
    ["a missing url", undefined],
  ])("never opens %s: it falls back to the dashboard", async (_name, url) => {
    const worker = boot();
    await worker.dispatch("notificationclick", clickEvent(url).event);
    expect(worker.opened).toEqual([`${ORIGIN}/internal/dashboard`]);
  });

  it("keeps the query string and hash of a legitimate internal url", async () => {
    const worker = boot();
    await worker.dispatch("notificationclick", clickEvent("/internal/support?status=open#top").event);
    expect(worker.opened).toEqual([`${ORIGIN}/internal/support?status=open#top`]);
  });

  it("treats a notification with no data at all as the dashboard", async () => {
    const worker = boot();
    await worker.dispatch("notificationclick", { notification: { close: () => undefined, data: null } });
    expect(worker.opened).toEqual([`${ORIGIN}/internal/dashboard`]);
  });
});

describe("pushsubscriptionchange", () => {
  it("resubscribes with the old options and posts the new subscription as the subscribe intent", async () => {
    const worker = boot();
    const key = new Uint8Array([1, 2, 3]).buffer;
    await worker.dispatch("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: key, userVisibleOnly: true } } });

    expect(worker.subscribed).toEqual([{ userVisibleOnly: true, applicationServerKey: key }]);
    expect(worker.posted).toHaveLength(1);
    const [request] = worker.posted;
    expect(request?.url).toBe("/internal/notifications");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.credentials).toBe("same-origin");
    expect(request?.init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    const form = new URLSearchParams(String(request?.init.body));
    expect(form.get("intent")).toBe("subscribe");
    expect(JSON.parse(form.get("subscription") ?? "null")).toEqual({
      endpoint: "https://push.invalid/new",
      keys: { p256dh: "p", auth: "a" },
    });
  });

  it("uses the new subscription the browser already made instead of subscribing twice", async () => {
    const worker = boot();
    await worker.dispatch("pushsubscriptionchange", {
      newSubscription: { toJSON: () => ({ endpoint: "https://push.invalid/given", keys: { p256dh: "p", auth: "a" } }) },
    });
    expect(worker.subscribed).toEqual([]);
    expect(new URLSearchParams(String(worker.posted[0]?.init.body)).get("subscription")).toContain("https://push.invalid/given");
  });

  it("does nothing when it has neither a new subscription nor the old options to resubscribe with", async () => {
    const worker = boot();
    await worker.dispatch("pushsubscriptionchange", { oldSubscription: null });
    expect(worker.subscribed).toEqual([]);
    expect(worker.posted).toEqual([]);
  });
});

describe("how the worker is served", () => {
  const headers = readFileSync(path.resolve(import.meta.dirname, "../../../public/_headers"), "utf8");
  /** The indented header lines under a URL line, per the Workers Assets `_headers` syntax. */
  function rulesFor(url: string): string[] {
    const lines = headers.split("\n");
    const start = lines.findIndex((line) => line.trim() === url && !line.startsWith(" ") && !line.startsWith("\t"));
    if (start === -1) return [];
    const rules: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (!/^[ \t]+\S/.test(line)) break;
      rules.push(line.trim());
    }
    return rules;
  }

  it("is revalidated on every load and may control the /internal/ scope", () => {
    expect(rulesFor("/internal-sw.js")).toEqual(["Cache-Control: no-cache", "Service-Worker-Allowed: /internal/"]);
  });
});
