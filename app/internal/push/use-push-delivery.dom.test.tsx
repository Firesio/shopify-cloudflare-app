import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster } from "~/internal/components/ui/sonner";
import { installPushBrowser, type PushBrowser } from "~/test/fake-push-browser";
import { usePushDelivery } from "./use-push-delivery";

let browser: PushBrowser | undefined;

afterEach(() => {
  cleanup();
  browser?.restore();
  browser = undefined;
});

function Probe() {
  usePushDelivery();
  return <Toaster />;
}

describe("usePushDelivery", () => {
  it("confirms in the page when the worker reports a push", async () => {
    browser = installPushBrowser();
    render(<Probe />);

    act(() => browser?.deliver({ type: "push-received", title: "Test notification", topic: "push_test" }));

    expect(await screen.findByText("Delivered to this device")).toBeTruthy();
    expect(await screen.findByText("Test notification")).toBeTruthy();
  });

  it("ignores messages that are not push confirmations", async () => {
    browser = installPushBrowser();
    render(<Probe />);

    act(() => {
      browser?.deliver({ type: "something-else", title: "nope" });
      browser?.deliver("a string");
      browser?.deliver(null);
      browser?.deliver({ type: "push-received" });
    });

    expect(screen.queryByText("Delivered to this device")).toBeNull();
  });

  it("does nothing, and does not throw, in a browser without service workers", () => {
    browser = installPushBrowser({ serviceWorker: false });
    expect(() => render(<Probe />)).not.toThrow();
  });
});
