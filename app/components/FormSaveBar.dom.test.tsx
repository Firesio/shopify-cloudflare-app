import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormSaveBar } from "./FormSaveBar";

// Shopify's Save Bar API, programmatic form: a `<ui-save-bar id>` with Save and Discard buttons, shown with
// `shopify.saveBar.show(id)` and hidden with `hide(id)`. This page decides when: shown while the form differs from
// where it started, hidden only when a save succeeded or the merchant discarded. A save the server refused leaves it
// up, untouched, with the merchant's edits under it. The host is faked at the `shopify` global.
const ID = "test-save-bar";
const show = vi.fn<(id: string) => Promise<void>>();
const hide = vi.fn<(id: string) => Promise<void>>();

beforeEach(() => {
  show.mockReset().mockResolvedValue(undefined);
  hide.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, "shopify", {
    value: { saveBar: { show, hide } },
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, "shopify");
});

type Result = { readonly ok: boolean } | undefined;

function mount(
  over: {
    onSubmit?: () => void;
    onReset?: () => void;
    startDirty?: boolean;
    onDiscard?: () => void;
  } = {},
) {
  const ui = (result: Result, busy = false) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        over.onSubmit?.();
      }}
      onReset={over.onReset}
    >
      <input name="title" defaultValue="a" />
      <s-text-field
        id="price"
        error={result?.ok === false ? "Enter a price" : undefined}
      />
      <FormSaveBar
        id={ID}
        result={result}
        refused={result?.ok === false}
        busy={busy}
        saveLabel="Save"
        discardLabel="Discard"
        startDirty={over.startDirty}
        onDiscard={over.onDiscard}
      />
    </form>
  );
  const view = render(ui(undefined));
  const bar = () => view.container.querySelector("ui-save-bar");
  const input = () => view.container.querySelector("input[name=title]");
  const type = (value: string) => {
    const el = input();
    if (!(el instanceof HTMLInputElement)) throw new Error("no input");
    el.value = value;
    fireEvent.input(el);
  };
  const press = (label: string) => {
    const button = Array.from(
      view.container.querySelectorAll("ui-save-bar button"),
    ).find((b) => b.textContent === label);
    if (button === undefined) throw new Error(`no ${label}`);
    fireEvent.click(button);
  };
  const submit = () => {
    const form = view.container.querySelector("form");
    if (form === null) throw new Error("no form");
    fireEvent.submit(form);
  };
  return {
    view,
    bar,
    type,
    press,
    submit,
    rerender: (result: Result, busy = false) => view.rerender(ui(result, busy)),
  };
}

describe("FormSaveBar", () => {
  it("renders a save bar with a primary Save and a Discard, and shows nothing while the form is unchanged", () => {
    const { bar } = mount();
    expect(bar()?.id).toBe(ID);
    expect(bar()?.querySelector("button[variant=primary]")?.textContent).toBe(
      "Save",
    );
    expect(show).not.toHaveBeenCalled();
  });

  it("shows the bar once the merchant changes a field, and hides it when they put it back", () => {
    const { type } = mount();
    type("b");
    expect(show).toHaveBeenCalledWith(ID);
    type("a");
    expect(hide).toHaveBeenCalledWith(ID);
  });

  it("Save submits the form", () => {
    const onSubmit = vi.fn();
    const { type, press } = mount({ onSubmit });
    type("b");
    press("Save");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps the bar up when the server refused the save: no hide, edits untouched", () => {
    const { type, submit, rerender } = mount();
    type("b");
    hide.mockClear();
    submit();
    rerender({ ok: false }, true);
    rerender({ ok: false }, false);
    expect(hide).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLInputElement>("input[name=title]")?.value,
    ).toBe("b");
  });

  it("takes the merchant to the first field the server refused, once per answer", () => {
    const { type, submit, rerender } = mount();
    const field = document.querySelector("#price");
    if (!(field instanceof HTMLElement)) throw new Error("no field");
    const focus = vi.spyOn(field, "focus");
    type("b");
    submit();
    const refusal = { ok: false };
    rerender(refusal, true);
    rerender(refusal, false);
    rerender(refusal, false);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("moves nothing when the save went through", () => {
    const { type, submit, rerender } = mount();
    const field = document.querySelector("#price");
    if (!(field instanceof HTMLElement)) throw new Error("no field");
    const focus = vi.spyOn(field, "focus");
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    type("b");
    submit();
    rerender({ ok: true }, false);
    expect(focus).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("hides the bar when the save went through", () => {
    const { type, submit, rerender } = mount();
    type("b");
    hide.mockClear();
    submit();
    rerender({ ok: true }, true);
    rerender({ ok: true }, false);
    expect(hide).toHaveBeenCalledWith(ID);
  });

  it("does not hide the bar for the outcome of something this form did not submit", () => {
    const { type, rerender } = mount();
    type("b");
    hide.mockClear();
    rerender({ ok: true });
    expect(hide).not.toHaveBeenCalled();
  });

  it("shows Save as loading while this form's request is in flight, and not for anyone else's", () => {
    const { type, submit, rerender, bar } = mount();
    type("b");
    rerender(undefined, true);
    expect(
      bar()?.querySelector("button[variant=primary]")?.hasAttribute("loading"),
    ).toBe(false);
    submit();
    rerender(undefined, true);
    expect(
      bar()?.querySelector("button[variant=primary]")?.hasAttribute("loading"),
    ).toBe(true);
    rerender({ ok: false }, false);
    expect(
      bar()?.querySelector("button[variant=primary]")?.hasAttribute("loading"),
    ).toBe(false);
  });

  it("Discard resets the form and hides the bar", () => {
    const onReset = vi.fn();
    const { type, press } = mount({ onReset });
    type("b");
    hide.mockClear();
    press("Discard");
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith(ID);
  });

  it("hides the bar when the page goes away, so it cannot outlive its form", () => {
    const { type, view } = mount();
    type("b");
    hide.mockClear();
    view.unmount();
    expect(hide).toHaveBeenCalledWith(ID);
  });

  it("handles the rejection when the host has already removed the bar", async () => {
    // A real rejected promise that records whether anyone attached a handler (what stops an unhandled rejection).
    let handled = false;
    const rejecting = Promise.reject(
      new Error(`SaveBar with ID ${ID} not found`),
    );
    const attach = rejecting.catch.bind(rejecting);
    rejecting.catch = (onRejected) => {
      handled = true;
      return attach(onRejected);
    };
    Object.defineProperty(globalThis, "shopify", {
      value: {
        saveBar: { show: () => Promise.resolve(), hide: () => rejecting },
      },
      configurable: true,
      writable: true,
    });
    const { type, view } = mount();
    type("b");
    view.unmount();
    await Promise.resolve();
    expect(handled).toBe(true);
  });

  it("asks for a confirmation on Discard only when told to", () => {
    const withIt = render(
      <form>
        <FormSaveBar
          id="x"
          result={undefined}
          refused={false}
          busy={false}
          saveLabel="Save"
          discardLabel="Discard"
          discardConfirmation
        />
      </form>,
    );
    expect(
      withIt.container
        .querySelector("ui-save-bar")
        ?.hasAttribute("discardconfirmation"),
    ).toBe(true);
    cleanup();
    const without = mount();
    expect(without.bar()?.hasAttribute("discardconfirmation")).toBe(false);
    void act;
  });

  describe("with a draft carried in (startDirty)", () => {
    it("shows the bar as soon as the page mounts, before the merchant touches anything", () => {
      mount({ startDirty: true });
      expect(show).toHaveBeenCalledWith(ID);
    });

    it("keeps it up when the merchant edits a field and types the starting value back: the draft is still unsaved", () => {
      const { type } = mount({ startDirty: true });
      type("b");
      type("a");
      expect(hide).not.toHaveBeenCalled();
    });

    it("keeps it up when the server refused the save, and hides it when the save went through", () => {
      const { submit, rerender } = mount({ startDirty: true });
      hide.mockClear();
      submit();
      rerender({ ok: false }, true);
      rerender({ ok: false }, false);
      expect(hide).not.toHaveBeenCalled();
      submit();
      rerender({ ok: true }, true);
      rerender({ ok: true }, false);
      expect(hide).toHaveBeenCalledWith(ID);
    });

    it("Discard tells the page to drop the draft and hides the bar", () => {
      const onDiscard = vi.fn();
      const { press } = mount({ startDirty: true, onDiscard });
      hide.mockClear();
      press("Discard");
      expect(onDiscard).toHaveBeenCalledTimes(1);
      expect(hide).toHaveBeenCalledWith(ID);
    });

    it("does not show the bar on a page that carries no draft", () => {
      mount({ startDirty: false });
      expect(show).not.toHaveBeenCalled();
    });
  });
});

describe("FormSaveBar when the page decides whether the form changed (`dirty`)", () => {
  function mountControlled(dirty: boolean, onDiscard?: () => void) {
    const ui = (isDirty: boolean) => (
      <form onSubmit={(event) => event.preventDefault()}>
        <input name="title" defaultValue="a" />
        <FormSaveBar id={ID} result={undefined} refused={false} busy={false} saveLabel="Save" discardLabel="Discard" dirty={isDirty} onDiscard={onDiscard} />
      </form>
    );
    const view = render(ui(dirty));
    const type = (value: string) => {
      const el = view.container.querySelector("input[name=title]");
      if (!(el instanceof HTMLInputElement)) throw new Error("no input");
      el.value = value;
      fireEvent.input(el);
    };
    return { view, type, rerender: (isDirty: boolean) => view.rerender(ui(isDirty)) };
  }

  it("shows the bar from the start when the page says the form changed, though no field was touched", () => {
    mountControlled(true);
    expect(show).toHaveBeenCalledWith(ID);
  });

  it("hides the bar when the page says the form is back to where it was, and shows it again when it changes", () => {
    const { rerender } = mountControlled(true);
    rerender(false);
    expect(hide).toHaveBeenCalledWith(ID);
    show.mockClear();
    rerender(true);
    expect(show).toHaveBeenCalledWith(ID);
  });

  it("is not moved by a field the merchant touched: the page's answer is the only one", () => {
    const { type, rerender } = mountControlled(false);
    type("b");
    expect(show).not.toHaveBeenCalled();
    rerender(true);
    show.mockClear();
    hide.mockClear();
    type("a");
    expect(hide).not.toHaveBeenCalled();
  });

  it("calls onDiscard when Discard is pressed, so the page can put its own state back", () => {
    const onDiscard = vi.fn();
    const { view } = mountControlled(true, onDiscard);
    const discard = Array.from(view.container.querySelectorAll("ui-save-bar button")).find((button) => button.textContent === "Discard");
    if (discard === undefined) throw new Error("no Discard");
    fireEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
