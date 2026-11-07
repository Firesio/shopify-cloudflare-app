import { afterEach, describe, expect, it, vi } from "vitest";
import { firstErrorTarget, revealFirstError } from "./first-error";

// After a refused save the merchant is taken to the first thing that is wrong. Polaris fields reflect `error` to an
// attribute and their hosts are `display: contents` (no box), so the field is found by attribute, focused when it
// delegates focus (which scrolls its inner input into view), and otherwise scrolled to through the first descendant
// that has a box. jsdom has no layout: boxes are stubbed per element.
afterEach(() => {
  document.body.innerHTML = "";
});

function page(html: string): HTMLElement {
  document.body.innerHTML = `<form>${html}</form>`;
  const form = document.querySelector("form");
  if (form === null) throw new Error("no form");
  return form;
}

describe("firstErrorTarget", () => {
  it("is the first field with an error, in document order", () => {
    const form = page(
      `<s-section><s-text-field id="a"></s-text-field><s-text-field id="b" error="Required"></s-text-field></s-section>
       <s-select id="c" error="Pick one"></s-select>`,
    );
    expect(firstErrorTarget(form)?.id).toBe("b");
  });

  it("skips a field whose error is empty", () => {
    const form = page(
      `<s-text-field id="a" error=""></s-text-field><s-number-field id="b" error="Too low"></s-number-field>`,
    );
    expect(firstErrorTarget(form)?.id).toBe("b");
  });

  it("finds an error drawn as text", () => {
    const form = page(
      `<s-text id="list" data-field-error="">Add at least one product</s-text><s-text-field id="b" error="x"></s-text-field>`,
    );
    expect(firstErrorTarget(form)?.id).toBe("list");
  });

  it("is null when nothing is wrong", () => {
    expect(firstErrorTarget(page(`<s-text-field></s-text-field>`))).toBeNull();
  });
});

describe("revealFirstError", () => {
  it("focuses a field that delegates focus, so the browser scrolls its input into view", () => {
    const form = page(`<s-text-field id="a" error="Required"></s-text-field>`);
    const field = form.querySelector("#a");
    if (!(field instanceof HTMLElement)) throw new Error("no field");
    const focus = vi.spyOn(field, "focus");
    expect(revealFirstError(form, { reducedMotion: false })).toBe("field");
    expect(focus).toHaveBeenCalledWith();
  });

  it("scrolls to the first box inside a choice list and focuses its first choice", () => {
    const form = page(
      `<s-choice-list id="l" error="Pick one"><s-choice id="c1"></s-choice><s-choice id="c2"></s-choice></s-choice-list>`,
    );
    const first = form.querySelector("#c1");
    if (!(first instanceof HTMLElement)) throw new Error("no choice");
    const focus = vi.spyOn(first, "focus");
    expect(revealFirstError(form, { reducedMotion: false })).toBe("field");
    expect(focus).toHaveBeenCalledWith();
  });

  it("scrolls a field with no input to its first box, smoothly unless motion is reduced", () => {
    const form = page(
      `<s-drop-zone id="d" error="Too large"><span id="box"></span></s-drop-zone>`,
    );
    const box = form.querySelector("#box");
    if (!(box instanceof HTMLElement)) throw new Error("no box");
    Object.defineProperty(box, "getClientRects", {
      value: () => ({ length: 1 }),
    });
    const scroll = vi.fn();
    Object.assign(box, { scrollIntoView: scroll });
    revealFirstError(form, { reducedMotion: true });
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
  });

  it("goes to the top and focuses the critical banner when no field carries the error", () => {
    document.body.innerHTML = `<s-banner tone="critical" heading="Save failed"></s-banner><form><s-text-field></s-text-field></form>`;
    const form = document.querySelector("form");
    const banner = document.querySelector("s-banner");
    if (form === null || !(banner instanceof HTMLElement))
      throw new Error("no page");
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const focus = vi.spyOn(banner, "focus");
    expect(revealFirstError(form, { reducedMotion: false })).toBe("banner");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(banner.getAttribute("tabindex")).toBe("-1");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    vi.unstubAllGlobals();
  });
});
