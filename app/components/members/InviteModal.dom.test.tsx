import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivationSeat } from "~/domain/member-team";
import { i18nOptions } from "~/i18n/options";
import type { MemberActionResult } from "~/members/feedback";
import { InviteModal } from "./InviteModal";

/**
 * The invite form as the merchant meets it: where a refusal shows, Enter, and what happens after a saved invitation. The
 * modal itself is host chrome (App Bridge), faked at the `shopify` global; a Polaris field's `value` is a property the way
 * a form control has one.
 */
const ROLES = ["admin", "member", "viewer"] as const;
const OPEN: ActivationSeat = { open: true };
const hide = vi.fn<(id: string) => Promise<void>>();

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "value", {
    configurable: true,
    get() {
      return this.getAttribute("value") ?? "";
    },
    set(value: unknown) {
      this.setAttribute("value", String(value));
    },
  });
});
afterAll(() => Reflect.deleteProperty(HTMLElement.prototype, "value"));
beforeEach(() => {
  hide.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, "shopify", { value: { modal: { show: vi.fn(), hide } }, configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, "shopify");
});

async function mount(props: { result?: MemberActionResult; seat?: ActivationSeat; busy?: boolean } = {}) {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ ...i18nOptions, lng: "en" });
  const onInvite = vi.fn();
  const element = (result: MemberActionResult | undefined) => (
    <I18nextProvider i18n={i18n}>
      <InviteModal roles={ROLES} defaultRole="member" busy={props.busy ?? false} result={result} seat={props.seat ?? OPEN} onInvite={onInvite} />
    </I18nextProvider>
  );
  const view = render(element(props.result));
  const q = (selector: string) => view.container.querySelector(selector);
  const type = (value: string) => {
    const field = q("s-email-field")!;
    Reflect.set(field, "value", value);
    fireEvent(field, new Event("input", { bubbles: true }));
  };
  return { view, q, type, onInvite, again: (result: MemberActionResult | undefined) => view.rerender(element(result)) };
}

describe("the invite form", () => {
  it("shows a refused address on the address field, not as a banner behind the modal", async () => {
    const page = await mount({ result: { error: "alreadyMember" } });
    expect(page.q("s-email-field")?.getAttribute("error")).toBe("That address is already on the team or has an open invitation.");
    expect(page.q("s-banner")).toBeNull();
    const invalid = await mount({ result: { error: "emailInvalid" } });
    expect(invalid.view.container.querySelector("s-email-field")?.getAttribute("error")).toBe("Enter a valid email address.");
  });

  it("shows any other refusal inside the modal, and no field error", async () => {
    const page = await mount({ result: { error: "forbidden" } });
    expect(page.q("s-banner[tone=critical]")?.textContent).toContain("You cannot do that");
    expect(page.q("s-email-field")?.hasAttribute("error")).toBe(false);
  });

  it("clears the refusal as soon as the merchant changes the address", async () => {
    const page = await mount({ result: { error: "alreadyMember" } });
    page.type("other@firesio.app");
    expect(page.q("s-email-field")?.hasAttribute("error")).toBe(false);
  });

  it("submits on Enter in the address field, with the address and role, and not when the field is empty", async () => {
    const page = await mount();
    fireEvent.keyDown(page.q("s-email-field")!, { key: "Enter" });
    expect(page.onInvite).not.toHaveBeenCalled();
    page.type("new@firesio.app");
    fireEvent.keyDown(page.q("s-email-field")!, { key: "a" });
    expect(page.onInvite).not.toHaveBeenCalled();
    fireEvent.keyDown(page.q("s-email-field")!, { key: "Enter" });
    expect(page.onInvite).toHaveBeenCalledWith({ email: "new@firesio.app", role: "member" });
  });

  it("does not submit twice while a request is in flight, and the button shows progress", async () => {
    const page = await mount({ busy: true });
    page.type("new@firesio.app");
    fireEvent.keyDown(page.q("s-email-field")!, { key: "Enter" });
    expect(page.onInvite).not.toHaveBeenCalled();
    expect(page.q('s-button[slot="primary-action"]')?.hasAttribute("loading")).toBe(true);
  });

  it("closes through App Bridge and empties itself once the invitation is saved", async () => {
    const page = await mount();
    page.type("new@firesio.app");
    expect(hide).not.toHaveBeenCalled();
    act(() => page.again({ success: "invited" }));
    expect(hide).toHaveBeenCalledWith("invite-modal");
    expect(page.q("s-email-field")?.getAttribute("value")).toBe("");
  });

  it("stays open after a refusal: nothing is hidden", async () => {
    const page = await mount();
    act(() => page.again({ error: "emailInvalid" }));
    expect(hide).not.toHaveBeenCalled();
  });

  it("says a person will wait when no seat is free or the plan cannot be read, and nothing when a seat is free", async () => {
    expect((await mount({ seat: { open: false, why: "full" } })).q("s-banner")?.textContent).toContain("they wait to be let in until a seat is free");
    expect((await mount({ seat: { open: false, why: "unreadable" } })).q("s-banner")?.textContent).toContain("until it can be read");
    expect((await mount()).q("s-banner")).toBeNull();
  });
});
