import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { RecentCallsTable } from "./recent-calls-table";
import type { RecentRun } from "./purposes";

function run(over: Partial<RecentRun> = {}): RecentRun {
  return {
    id: "r1",
    role: "writing",
    feature: "support-draft",
    modelId: "@cf/meta/llama",
    status: "ok",
    reasonCode: null,
    tokens: 1200,
    latencyMs: 350,
    ...over,
  };
}

function plain(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function bodyRows(html: string): string[] {
  const body = html.match(/<tbody[^>]*>(.*?)<\/tbody>/s)?.[1] ?? "";
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((match) => plain(match[1]));
}

describe("the recent AI calls table", () => {
  it("shows tokens and latency in the row of the call they belong to, formatted for English", async () => {
    const html = renderToString(
      <RecentCallsTable runs={[run(), run({ id: "r2", feature: "summary", tokens: 7, latencyMs: null })]} />,
    );
    const rows = bodyRows(html);
    const draft = rows.find((text) => text.includes("support-draft")) ?? "";
    expect(draft).toContain("1,200");
    expect(draft).toContain("350 ms");
    const summary = rows.find((text) => text.includes("summary")) ?? "";
    expect(summary).toContain("—");
  });

  it("names the reason on a failed call and marks it as an error", () => {
    const html = renderToString(<RecentCallsTable runs={[run({ status: "error", reasonCode: "timeout" })]} />);
    expect(bodyRows(html)[0]).toContain("timeout");
  });

  it("shows an empty state in the body when there are no calls", () => {
    const html = renderToString(<RecentCallsTable runs={[]} />);
    expect(bodyRows(html)).toEqual([expect.stringContaining("No calls yet")]);
  });
});
