import { describe, expect, it } from "vitest";
import { Deferred, FailedSection, PendingSection } from "./Deferred";
import { SkeletonText } from "./Skeleton";
import { renderRoute } from "~/test/render-route";
import type { Outcome } from "~/admin/outcome";

const never = new Promise<never>(() => undefined);

/** The page a route would write: the section, its real heading and its static line are the same pending and loaded. */
function Probe({ region }: { region: Promise<Outcome<string>> }) {
  return (
    <Deferred
      resolve={region}
      pending={
        <PendingSection heading="Plans" label="Loading plans">
          <s-paragraph>Pick a plan.</s-paragraph>
          <SkeletonText chars={10} />
        </PendingSection>
      }
      failed={<FailedSection heading="Could not load" body="Reload the page." />}
    >
      {(value) => (
        <s-section heading="Plans" accessibilityLabel="Loading plans">
          <s-paragraph>Pick a plan.</s-paragraph>
          <s-text>{value}</s-text>
        </s-section>
      )}
    </Deferred>
  );
}

const probe = (region: Promise<Outcome<string>>, stage: "pending" | "settled") =>
  renderRoute({ path: "/probe", Component: () => <Probe region={region} />, loaderData: {}, stage });

const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;

describe("Deferred", () => {
  it("shows the section's real heading and static parts at once, with skeletons where the data goes", async () => {
    const html = await probe(never, "pending");
    expect(html).toContain('heading="Plans"');
    expect(html).toContain("Pick a plan.");
    expect(html).toContain('data-skeleton=""');
    expect(html).not.toContain("Loaded");
  });

  it("announces the wait once, and uses no spinner", async () => {
    const html = await probe(never, "pending");
    expect(html.match(/role="status"|accessibilityRole="status"/g)).toHaveLength(1);
    expect(html).toContain("Loading plans");
    expect(html).not.toContain("<s-spinner");
  });

  it("has the same structure pending and loaded: one section, the same heading and the same static line", async () => {
    const pending = await probe(never, "pending");
    const loaded = await probe(Promise.resolve({ ok: true, value: "42 tickets" }), "settled");
    expect(count(pending, "s-section")).toBe(1);
    expect(count(loaded, "s-section")).toBe(1);
    for (const html of [pending, loaded]) {
      expect(html).toContain('heading="Plans"');
      expect(html).toContain("<s-paragraph>Pick a plan.</s-paragraph>");
    }
    expect(loaded).toContain("42 tickets");
    expect(loaded).not.toContain("data-skeleton");
  });

  it("falls back to three skeleton lines when the section gives no children", async () => {
    const html = await renderRoute({
      path: "/probe",
      Component: () => <PendingSection heading="Plans" label="Loading plans" />,
      loaderData: {},
      stage: "pending",
    });
    expect(html.match(/data-skeleton=""/g)).toHaveLength(3);
  });

  it("shows a critical banner, not a value, when the region failed", async () => {
    const html = await probe(Promise.resolve({ ok: false, reason: "failed" }), "settled");
    expect(html).toContain('tone="critical"');
    expect(html).toContain("Could not load");
    expect(html).not.toContain("Loaded");
  });

  it("shows the same banner when the stream itself rejects (stream timeout)", async () => {
    const html = await probe(Promise.reject(new Error("Server timeout.")), "settled");
    expect(html).toContain('tone="critical"');
    expect(html).toContain("Could not load");
  });
});
