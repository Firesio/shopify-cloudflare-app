import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { campaignFixture, previewFixture } from "~/test/campaign-views";
import type { AudiencePreview } from "~/domain/campaign-audience";
import CampaignDetail from "./detail";
import type { CampaignActionResult } from "./outcomes";

/**
 * The editor in a DOM, with a fake action standing in for the server (its intents are covered by the integration test).
 * These prove what the page SUBMITS, which is the contract the real action reads, and what it shows from the answer.
 */
type Submission = Record<string, string>;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
});

afterEach(cleanup);

interface Mounted {
  readonly submissions: Submission[];
}

function mount(options: { preview?: AudiencePreview; respond?: (submission: Submission) => CampaignActionResult } = {}): Mounted {
  const submissions: Submission[] = [];
  const preview = options.preview ?? previewFixture();
  const router = createMemoryRouter(
    [
      {
        path: "/internal/campaigns/:campaignId",
        Component: CampaignDetail,
        loader: () => ({ actorEmail: "me@firesio.app", screen: { kind: "draft", campaign: campaignFixture(), preview } }),
        action: async ({ request }) => {
          const submission: Submission = {};
          for (const [key, value] of await request.formData()) if (typeof value === "string") submission[key] = value;
          submissions.push(submission);
          const result: CampaignActionResult = options.respond?.(submission) ?? { kind: "done", message: "ok" };
          return data(result, { status: result.kind === "failed" ? 400 : 200 });
        },
      },
    ],
    { initialEntries: ["/internal/campaigns/campaign-1"] },
  );
  render(<RouterProvider router={router} />);
  return { submissions };
}

describe("saving", () => {
  it("submits every field the action reads, under the names it reads them by", async () => {
    const { submissions } = mount();
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({
      intent: "save",
      name: "Renamed",
      subject: "A big update is coming",
      body: "Next week we ship a redesigned dashboard.\n\nNothing changes until you open it.",
      ctaLabel: "See what is new",
      ctaUrl: "https://firesio.app/news",
      audienceKind: "real",
      installedAfter: "",
      installedBefore: "",
    });
  });

  it("marks each faulty field with the server's complaint, and keeps what was typed", async () => {
    mount({
      respond: () => ({ kind: "failed", message: "Some fields need fixing before this can be saved.", fields: { subject: "required", ctaUrl: "invalidUrl" } }),
    });
    const subject = await screen.findByLabelText("Subject");
    fireEvent.change(subject, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Button link (optional)"), { target: { value: "http://plain.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Subject is required.")).toBeTruthy();
    expect(screen.getByText("The link must be a full address starting with https://")).toBeTruthy();
    expect(screen.getByLabelText("Subject").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("false");
    expect((screen.getByLabelText("Button link (optional)") as HTMLInputElement).value).toBe("http://plain.example");
    expect(screen.getByText(/Some fields need fixing/)).toBeTruthy();
  });

  it("counts characters as they are typed, against the limit", async () => {
    mount();
    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "x".repeat(101) } });
    const counter = await screen.findByText("101 / 100");
    expect(counter.className).toContain("text-destructive");
  });
});

describe("the audience count", () => {
  it("asks the server about the audience as it is in the form now, and shows the answer next to its label", async () => {
    const { submissions } = mount({
      respond: (submission) =>
        submission.intent === "preview"
          ? { kind: "preview", preview: previewFixture({ matched: 40, withoutAddress: 4, unsubscribed: 6, recipients: 30, sample: [] }) }
          : { kind: "done", message: "ok" },
    });
    const choices = await screen.findByRole("region", { name: "Who would receive it: your choices" });
    const saved = screen.getByRole("region", { name: "Who would receive it: the saved draft" });
    fireEvent.click(screen.getByRole("radio", { name: /Only test stores/ }));
    fireEvent.change(screen.getByLabelText("On or after"), { target: { value: "2026-01-15" } });
    expect(screen.getByText(/You changed the audience/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh count" }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toMatchObject({ intent: "preview", audienceKind: "dev", installedAfter: "2026-01-15" });

    // Each figure beside its own label, in the choices card.
    const figure = (label: string) => within(within(choices).getByText(label).parentElement as HTMLElement);
    await waitFor(() => expect(figure("Shops that match").getByText("40")).toBeTruthy());
    expect(figure("Without an email address").getByText("4")).toBeTruthy();
    expect(figure("Unsubscribed").getByText("6")).toBeTruthy();
    expect(within(choices).getByText("shops will receive it").previousElementSibling?.textContent).toBe("30");
    expect(within(choices).getByText("Counted just now for the choices above.")).toBeTruthy();
    // The review below still reads the saved draft: a count of unsaved choices is not what a send would use.
    expect(within(saved).getByText("shops will receive it").previousElementSibling?.textContent).toBe("9");
  });
});

describe("review and send", () => {
  it("asks again, with the number, before sending, and sends that number", async () => {
    const { submissions } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Send to 9 shops" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Send to 9 shops?")).toBeTruthy();
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy();
    expect(submissions).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Send to 9 shops" }));
    await waitFor(() => expect(submissions).toEqual([{ intent: "start", expectedRecipients: "9" }]));
  });

  it("sends nothing when the person says not yet", async () => {
    const { submissions } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Send to 9 shops" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(submissions).toEqual([]);
  });

  it("shows why nothing was sent when the audience changed under the reviewer", async () => {
    mount({ respond: () => ({ kind: "failed", message: "The audience changed while you were reviewing: it now reaches 12 shops, not the 9 you were shown. Nothing was sent.", fields: {} }) });
    fireEvent.click(await screen.findByRole("button", { name: "Send to 9 shops" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Send to 9 shops" }));
    expect(await screen.findByText(/it now reaches 12 shops, not the 9 you were shown/)).toBeTruthy();
  });

  it("waits for a save when the form has unsaved changes, because the send uses the saved draft", async () => {
    mount();
    const send = await screen.findByRole("button", { name: "Send to 9 shops" });
    const test = screen.getByRole("button", { name: "Send me a test" });
    expect((send as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "A different subject" } });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(true));
    expect((test as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/You have changes that are not saved/)).toBeTruthy();
  });

  it("sends a test to the signed-in person with just the intent", async () => {
    const { submissions } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Send me a test" }));
    await waitFor(() => expect(submissions).toEqual([{ intent: "test" }]));
  });

  it("confirms before deleting the draft, then deletes it", async () => {
    const { submissions } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete “Big update”?")).toBeTruthy();
    expect(submissions).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(submissions).toEqual([{ intent: "delete" }]));
  });
});
