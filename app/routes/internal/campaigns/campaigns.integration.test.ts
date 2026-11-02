import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { RouterContextProvider } from "react-router";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { shops } from "~/db/schema";
import { AdminUserRepo } from "~/models/admin-users.server";
import { CampaignRepo } from "~/models/campaigns.server";
import { runWithRequestContext } from "~/request-context.server";
import { createAdmin } from "~/services/admin-management.server";
import { createAdminSession, HOME_PATH } from "~/services/admin-auth.server";
import { defined } from "~/test/defined";
import { fakeRuntime } from "~/test/fake-runtime";
import { setupTestDatabase } from "~/test/db";
import { action as detailAction, loader as detailLoader } from "./detail";
import { loader as listLoader } from "./index";
import { action as newAction, loader as newLoader } from "./new";

/**
 * The announcement console's SERVER side, against real local D1, the real wiring and real sessions: the real loaders and
 * actions of the three routes. Delivery goes to the local campaigns queue binding, which only receives the first step:
 * these tests prove what a person's request changes and what the page is given back. The components are checked in the
 * render tests, and by eye.
 */
setupTestDatabase();

const ORIGIN = "https://example.test";
const PASSWORD = "a-long-enough-password";
const authDeps = { users: new AdminUserRepo(), runtime: fakeRuntime() };
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const db = drizzle(env.DB);

async function signedIn(email: string): Promise<{ cookie: string; id: string }> {
  const created = await createAdmin({ name: "Test", email, password: PASSWORD, role: "admin" }, authDeps);
  if (!created.ok) throw new Error(`fixture: ${created.reason}`);
  const header = (await createAdminSession(created.value.id, HOME_PATH)).headers.get("Set-Cookie");
  if (!header) throw new Error("expected a Set-Cookie header");
  return { cookie: defined(header.split(";")[0]), id: created.value.id };
}

function args(request: Request, params: Record<string, string> = {}) {
  return { request, params, context: new RouterContextProvider(), url: new URL(request.url), pattern: new URL(request.url).pathname };
}

const get = (path: string, cookie?: string, params?: Record<string, string>) =>
  args(new Request(`${ORIGIN}${path}`, { headers: cookie ? { Cookie: cookie } : {} }), params);

function post(path: string, fields: Record<string, string>, options: { cookie?: string; origin?: string | null; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  return args(new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: new URLSearchParams(fields) }), options.params);
}

const DRAFT_FIELDS = {
  intent: "save",
  name: "Big update",
  subject: "A big update is coming",
  body: "Next week we ship a redesigned dashboard.\n\nNothing changes until you open it.",
  ctaLabel: "See what is new",
  ctaUrl: "https://firesio.app/news",
  audienceKind: "real",
  installedAfter: "",
  installedBefore: "",
};

async function seedShops(count: number, extra: Partial<typeof shops.$inferInsert> = {}) {
  await db.insert(shops).values(
    Array.from({ length: count }, (_, index) => ({ shop: `s${index + 1}.myshopify.com`, name: `Store ${index + 1}`, email: `s${index + 1}@firesio.app`, installedAt: 1_000, ...extra })),
  );
}

async function thrown(run: Promise<unknown>): Promise<unknown> {
  return run.then(
    () => null,
    (caught: unknown) => caught,
  );
}

const bodySchema = z.looseObject({ kind: z.enum(["done", "preview", "failed"]) });

/** What an action answered: the body and status of a `data()`, or the redirect target. */
async function answer(run: Promise<unknown>): Promise<{ kind: "redirect"; to: string } | { kind: "data"; body: z.infer<typeof bodySchema>; status: number }> {
  const result = await run;
  if (result instanceof Response) return { kind: "redirect", to: defined(result.headers.get("Location")) };
  if (typeof result === "object" && result !== null && "data" in result && "init" in result) {
    const init = result.init;
    const status = typeof init === "object" && init !== null && "status" in init && typeof init.status === "number" ? init.status : 200;
    return { kind: "data", body: bodySchema.parse(result.data), status };
  }
  throw new Error("expected a redirect or data()");
}

/** Creates a draft through the real action, and returns its id from the redirect. */
async function createDraftVia(cookie: string, overrides: Record<string, string> = {}): Promise<string> {
  const outcome = await answer(newAction(post("/internal/campaigns/new", { ...DRAFT_FIELDS, ...overrides }, { cookie })));
  if (outcome.kind !== "redirect") throw new Error("fixture: the draft was not created");
  return defined(outcome.to.split("/").pop());
}

const detail = (id: string) => `/internal/campaigns/${id}`;
const act = (id: string, cookie: string, fields: Record<string, string>, origin?: string | null) =>
  answer(detailAction(post(detail(id), fields, { cookie, origin, params: { campaignId: id } })));
const view = (id: string, cookie: string, query = "") => detailLoader(get(`${detail(id)}${query}`, cookie, { campaignId: id }));

describe("access", () => {
  it("sends an unauthenticated request to sign in, from every route", async () => {
    await inRequest(async () => {
      for (const run of [listLoader(get("/internal/campaigns")), newLoader(get("/internal/campaigns/new")), detailLoader(get(detail("x"), undefined, { campaignId: "x" }))]) {
        const response = await thrown(run);
        expect(response).toBeInstanceOf(Response);
        expect(response instanceof Response && response.status).toBe(302);
      }
    });
  });

  it("refuses a post that does not come from this site, and changes nothing", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const response = await thrown(newAction(post("/internal/campaigns/new", DRAFT_FIELDS, { cookie, origin: "https://evil.example" })));
      expect(response instanceof Response && response.status).toBe(403);
      expect(await new CampaignRepo().list(10)).toEqual([]);
    });
  });

  it("refuses an unauthenticated post and a disabled account", async () => {
    await inRequest(async () => {
      const unauthenticated = await thrown(newAction(post("/internal/campaigns/new", DRAFT_FIELDS)));
      expect(unauthenticated instanceof Response && unauthenticated.status).toBe(302);

      const { cookie, id } = await signedIn("gone@firesio.app");
      await new AdminUserRepo().setStatus(id, "disabled", 1);
      const disabled = await thrown(newAction(post("/internal/campaigns/new", DRAFT_FIELDS, { cookie })));
      expect(disabled instanceof Response && disabled.status).toBe(302);
      expect(await new CampaignRepo().list(10)).toEqual([]);
    });
  });
});

describe("the list", () => {
  it("is empty before anything is written, then shows newest first with who made it", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("writer@firesio.app");
      expect((await listLoader(get("/internal/campaigns", cookie))).campaigns).toEqual([]);

      const first = await createDraftVia(cookie, { name: "First" });
      const second = await createDraftVia(cookie, { name: "Second" });
      const { campaigns, limit } = await listLoader(get("/internal/campaigns", cookie));
      expect(limit).toBe(100);
      expect(campaigns.map((campaign) => [campaign.id, campaign.name, campaign.status, campaign.createdByEmail])).toEqual([
        [second, "Second", "draft", "writer@firesio.app"],
        [first, "First", "draft", "writer@firesio.app"],
      ]);
    });
  });
});

describe("writing a draft", () => {
  it("counts the default audience on the new page: real stores with an address, not unsubscribed", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(3);
      await db.insert(shops).values({ shop: "dev.myshopify.com", name: "Dev", email: "dev@firesio.app", isDevStore: true, installedAt: 1_000 });
      const { preview, actorEmail } = await newLoader(get("/internal/campaigns/new", cookie));
      expect(actorEmail).toBe("a@firesio.app");
      expect(preview).toMatchObject({ matched: 3, recipients: 3 });
    });
  });

  it("saves a new draft and goes to its page, where the editor shows what was written and who would get it", async () => {
    await inRequest(async () => {
      const { cookie, id: adminId } = await signedIn("a@firesio.app");
      await seedShops(2);
      const id = await createDraftVia(cookie);
      const { screen } = await view(id, cookie);
      expect(screen.kind).toBe("draft");
      if (screen.kind !== "draft") return;
      expect(screen.campaign).toMatchObject({ name: "Big update", subject: "A big update is coming", ctaLabel: "See what is new", status: "draft", createdBy: adminId, createdByEmail: "a@firesio.app" });
      expect(screen.preview.recipients).toBe(2);
    });
  });

  it("answers every faulty field at once and saves nothing", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const outcome = await answer(newAction(post("/internal/campaigns/new", { ...DRAFT_FIELDS, name: " ", subject: "x".repeat(151), ctaUrl: "http://plain.example" }, { cookie })));
      expect(outcome).toMatchObject({
        kind: "data",
        status: 400,
        body: { kind: "failed", fields: { name: "required", subject: "tooLong", ctaUrl: "invalidUrl" } },
      });
      expect(await new CampaignRepo().list(10)).toEqual([]);
    });
  });

  it("updates a draft in place, and its audience", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(2);
      await db.insert(shops).values({ shop: "dev.myshopify.com", name: "Dev", email: "dev@firesio.app", isDevStore: true, installedAt: 1_000 });
      const id = await createDraftVia(cookie);
      const saved = await act(id, cookie, { ...DRAFT_FIELDS, name: "Renamed", audienceKind: "all" });
      expect(saved).toMatchObject({ kind: "data", status: 200, body: { kind: "done", message: "Draft saved." } });
      const { screen } = await view(id, cookie);
      if (screen.kind !== "draft") throw new Error("expected a draft");
      expect(screen.campaign.name).toBe("Renamed");
      expect(screen.campaign.audience.kind).toBe("all");
      expect(screen.preview.recipients).toBe(3);
    });
  });

  it("refuses a form with a field missing instead of guessing", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const { ctaLabel: _label, ...incomplete } = DRAFT_FIELDS;
      const outcome = await answer(newAction(post("/internal/campaigns/new", incomplete, { cookie })));
      expect(outcome).toMatchObject({ kind: "data", status: 400, body: { kind: "failed" } });
    });
  });

  it("answers an unknown intent as a bad request", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const outcome = await answer(newAction(post("/internal/campaigns/new", { intent: "drop-everything" }, { cookie })));
      expect(outcome).toMatchObject({ kind: "data", status: 400, body: { kind: "failed" } });
    });
  });

  it("deletes a draft and goes back to the list, where it is gone", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const id = await createDraftVia(cookie);
      expect(await act(id, cookie, { intent: "delete" })).toEqual({ kind: "redirect", to: "/internal/campaigns" });
      expect((await listLoader(get("/internal/campaigns", cookie))).campaigns).toEqual([]);
    });
  });

  it("answers an unknown campaign with a 404", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const error = await thrown(view("nope", cookie));
      expect(error).toMatchObject({ init: { status: 404 } });
    });
  });
});

describe("the preview", () => {
  it("counts the audience as it is in the form, without saving anything", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(2);
      await db.insert(shops).values({ shop: "dev.myshopify.com", name: "Dev", email: "dev@firesio.app", isDevStore: true, installedAt: 1_000 });
      const outcome = await answer(newAction(post("/internal/campaigns/new", { intent: "preview", audienceKind: "dev" }, { cookie })));
      expect(outcome).toMatchObject({ kind: "data", status: 200, body: { kind: "preview", preview: { matched: 1, recipients: 1 } } });
      expect(await new CampaignRepo().list(10)).toEqual([]);
    });
  });
});

describe("the test mail", () => {
  it("says honestly when it could not be delivered (no mail channel is configured in tests)", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const id = await createDraftVia(cookie);
      const outcome = await act(id, cookie, { intent: "test" });
      expect(outcome).toMatchObject({ kind: "data", status: 400, body: { kind: "failed" } });
      // A test is not a send: the draft is still a draft.
      expect((await view(id, cookie)).screen.kind).toBe("draft");
    });
  });
});

describe("sending", () => {
  it("starts when the number shown is still true: the page becomes a report with everyone waiting", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(3);
      const id = await createDraftVia(cookie);
      const outcome = await act(id, cookie, { intent: "start", expectedRecipients: "3" });
      expect(outcome).toMatchObject({ kind: "data", status: 200, body: { kind: "done", message: expect.stringContaining("3 shops") } });

      const { screen } = await view(id, cookie);
      expect(screen.kind).toBe("report");
      if (screen.kind !== "report") return;
      expect(screen.campaign).toMatchObject({ status: "sending", recipientCount: 3 });
      expect(screen.counts).toEqual({ pending: 3, sent: 0, failed: 0, refused: 0, skipped: 0 });
      expect(screen.recipients.map((recipient) => recipient.shop).sort()).toEqual(["s1.myshopify.com", "s2.myshopify.com", "s3.myshopify.com"]);
    });
  });

  it("does not send when the audience is not the size the reviewer was shown, and says what it is now", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(3);
      const id = await createDraftVia(cookie);
      const outcome = await act(id, cookie, { intent: "start", expectedRecipients: "2" });
      expect(outcome).toMatchObject({ kind: "data", status: 400, body: { kind: "failed", message: expect.stringMatching(/now reaches 3 shops, not the 2 you were shown/) } });
      expect((await view(id, cookie)).screen.kind).toBe("draft");
    });
  });

  it("does not send to nobody", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const id = await createDraftVia(cookie);
      const outcome = await act(id, cookie, { intent: "start", expectedRecipients: "0" });
      expect(outcome).toMatchObject({ kind: "data", status: 400, body: { kind: "failed", message: expect.stringContaining("Nobody would receive this") } });
      expect((await view(id, cookie)).screen.kind).toBe("draft");
    });
  });

  it("refuses a start that does not say how many were shown", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(1);
      const id = await createDraftVia(cookie);
      for (const expectedRecipients of [undefined, "", "-1", "three"]) {
        const fields: Record<string, string> = { intent: "start" };
        if (expectedRecipients !== undefined) fields.expectedRecipients = expectedRecipients;
        expect(await act(id, cookie, fields)).toMatchObject({ kind: "data", status: 400, body: { kind: "failed" } });
      }
      expect((await view(id, cookie)).screen.kind).toBe("draft");
    });
  });

  it("sends a second start of the same draft nowhere: it is no longer a draft", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(2);
      const id = await createDraftVia(cookie);
      await act(id, cookie, { intent: "start", expectedRecipients: "2" });
      const again = await act(id, cookie, { intent: "start", expectedRecipients: "2" });
      expect(again).toMatchObject({ kind: "data", status: 400, body: { kind: "failed", message: expect.stringContaining("already sent or cancelled") } });
      const { screen } = await view(id, cookie);
      expect(screen.kind === "report" && screen.counts.pending).toBe(2);
    });
  });

  it("no longer lets the words be edited or the draft deleted once sending has started", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      await seedShops(1);
      const id = await createDraftVia(cookie);
      await act(id, cookie, { intent: "start", expectedRecipients: "1" });
      expect(await act(id, cookie, { ...DRAFT_FIELDS, name: "Changed" })).toMatchObject({ kind: "data", status: 400, body: { kind: "failed" } });
      expect(await act(id, cookie, { intent: "delete" })).toMatchObject({ kind: "data", status: 400, body: { kind: "failed" } });
      const { screen } = await view(id, cookie);
      expect(screen.campaign.name).toBe("Big update");
    });
  });
});

describe("controlling a campaign that is sending", () => {
  async function sending(cookie: string): Promise<string> {
    await seedShops(2);
    const id = await createDraftVia(cookie);
    await act(id, cookie, { intent: "start", expectedRecipients: "2" });
    return id;
  }
  const statusOf = async (id: string, cookie: string) => (await view(id, cookie)).screen.campaign.status;

  it("pauses, resumes and cancels, and cancelling marks whoever was waiting as skipped", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const id = await sending(cookie);

      expect(await act(id, cookie, { intent: "pause" })).toMatchObject({ body: { kind: "done" } });
      expect(await statusOf(id, cookie)).toBe("paused");
      expect(await act(id, cookie, { intent: "resume" })).toMatchObject({ body: { kind: "done" } });
      expect(await statusOf(id, cookie)).toBe("sending");
      expect(await act(id, cookie, { intent: "pause" })).toMatchObject({ body: { kind: "done" } });
      expect(await act(id, cookie, { intent: "cancel" })).toMatchObject({ body: { kind: "done" } });

      const { screen } = await view(id, cookie);
      if (screen.kind !== "report") throw new Error("expected a report");
      expect(screen.campaign.status).toBe("cancelled");
      expect(screen.counts).toEqual({ pending: 0, sent: 0, failed: 0, refused: 0, skipped: 2 });
    });
  });

  it("refuses a move the state does not allow, and a cancelled campaign stays cancelled", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const id = await sending(cookie);
      expect(await act(id, cookie, { intent: "resume" })).toMatchObject({ status: 400, body: { kind: "failed" } });
      await act(id, cookie, { intent: "cancel" });
      for (const intent of ["resume", "pause", "cancel"]) {
        expect(await act(id, cookie, { intent })).toMatchObject({ status: 400, body: { kind: "failed" } });
      }
      expect(await statusOf(id, cookie)).toBe("cancelled");
    });
  });

  it("limits the recipient table to one status, read from the URL", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const id = await sending(cookie);
      await act(id, cookie, { intent: "cancel" });
      const skipped = (await view(id, cookie, "?status=skipped")).screen;
      const sent = (await view(id, cookie, "?status=sent")).screen;
      const bogus = (await view(id, cookie, "?status=drop-table")).screen;
      expect(skipped.kind === "report" && skipped.recipients.length).toBe(2);
      expect(sent.kind === "report" && sent.recipients.length).toBe(0);
      expect(sent.kind === "report" && sent.recipientStatus).toBe("sent");
      // Anything that is not a status means everyone.
      expect(bogus.kind === "report" && [bogus.recipientStatus, bogus.recipients.length]).toEqual([null, 2]);
    });
  });

  it("controls only the campaign in the URL, never one named in the form", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@firesio.app");
      const mine = await sending(cookie);
      const other = await createDraftVia(cookie, { name: "Other" });
      await act(other, cookie, { intent: "pause", id: mine, campaignId: mine });
      expect(await statusOf(mine, cookie)).toBe("sending");
    });
  });
});
