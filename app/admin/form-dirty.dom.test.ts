import { afterEach, describe, expect, it } from "vitest";
import { trackDirty } from "./form-dirty";

// The programmatic save bar needs to know when a form differs from where it started, the way `data-save-bar` does:
// a field the merchant touched whose value now differs from its starting value. A value a script changed without the
// merchant touching anything (a field that normalises its value when it hydrates) is not a change.
function mount(html: string) {
  const form = document.createElement("form");
  form.innerHTML = html;
  document.body.appendChild(form);
  const changes: boolean[] = [];
  const tracker = trackDirty(form, (dirty) => changes.push(dirty));
  const field = (name: string) => {
    const el = form.elements.namedItem(name);
    if (!(el instanceof HTMLInputElement)) throw new Error(`no ${name}`);
    return el;
  };
  const type = (name: string, value: string) => {
    const el = field(name);
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { form, tracker, changes, field, type };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("trackDirty", () => {
  it("starts clean and tells nobody", () => {
    const { tracker, changes } = mount('<input name="a" value="x">');
    expect(tracker.isDirty()).toBe(false);
    expect(changes).toEqual([]);
  });

  it("is dirty once a field the merchant typed in differs, and clean again when they put it back", () => {
    const { tracker, changes, type } = mount('<input name="a" value="x">');
    type("a", "y");
    expect(tracker.isDirty()).toBe(true);
    type("a", "x");
    expect(tracker.isDirty()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("tells about a change once, not on every keystroke", () => {
    const { changes, type } = mount('<input name="a" value="x">');
    type("a", "y");
    type("a", "yy");
    type("a", "yyy");
    expect(changes).toEqual([true]);
  });

  it("ignores a value that changed without the merchant touching the field", () => {
    const { tracker, field, type } = mount(
      '<input name="a" value="x"><input name="b" value="1">',
    );
    field("b").value = "2";
    type("a", "x");
    expect(tracker.isDirty()).toBe(false);
  });

  it("never counts a control inside a region marked as acting on its own (an upload that saves at once)", () => {
    const { form, tracker, changes } = mount(
      '<input name="a" value="x"><div data-save-bar-ignore><input name="logo" value=""></div>',
    );
    const inside = form.elements.namedItem("logo");
    if (!(inside instanceof HTMLInputElement)) throw new Error("no logo");
    inside.dispatchEvent(new Event("focusin", { bubbles: true }));
    inside.value = "picked.png";
    inside.dispatchEvent(new Event("change", { bubbles: true }));
    inside.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tracker.isDirty()).toBe(false);
    expect(changes).toEqual([]);
  });

  it("still counts a field outside the marked region", () => {
    const { tracker, type } = mount(
      '<input name="a" value="x"><div data-save-bar-ignore><input name="logo"></div>',
    );
    type("a", "y");
    expect(tracker.isDirty()).toBe(true);
  });

  it("sees a checkbox that was ticked", () => {
    const { form, tracker } = mount('<input name="on" type="checkbox">');
    const box = form.elements.namedItem("on");
    if (!(box instanceof HTMLInputElement)) throw new Error("no box");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
  });

  it("sees a hidden field a list editor rewrote and announced, as the save bar always did", () => {
    const { tracker, field } = mount(
      '<input type="hidden" name="terms" value="[]">',
    );
    const hidden = field("terms");
    hidden.value = '["a"]';
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
  });

  it("takes a field added later as it was when it first appeared", () => {
    const { form, tracker } = mount('<input name="a" value="x">');
    const added = document.createElement("input");
    added.name = "late";
    added.value = "1";
    form.appendChild(added);
    added.dispatchEvent(new Event("focusin", { bubbles: true }));
    added.value = "2";
    added.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
  });

  it("sees a choice list, which holds `values` (an array) and has no `value`", () => {
    const { form, tracker, changes } = mount("");
    const list = document.createElement("div");
    Object.assign(list, { values: ["none"] });
    form.appendChild(list);
    list.dispatchEvent(new Event("focusin", { bubbles: true }));
    Object.assign(list, { values: ["popup"] });
    list.dispatchEvent(new Event("change", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
    Object.assign(list, { values: ["none"] });
    list.dispatchEvent(new Event("change", { bubbles: true }));
    expect(tracker.isDirty()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("starts again from the current values on rebaseline, and says it is clean", () => {
    const { tracker, changes, type } = mount('<input name="a" value="x">');
    type("a", "y");
    tracker.rebaseline();
    expect(tracker.isDirty()).toBe(false);
    expect(changes).toEqual([true, false]);
    type("a", "y");
    expect(tracker.isDirty()).toBe(false);
    type("a", "z");
    expect(tracker.isDirty()).toBe(true);
  });

  it("listens no more once disposed", () => {
    const { tracker, changes, type } = mount('<input name="a" value="x">');
    tracker.dispose();
    type("a", "y");
    expect(changes).toEqual([]);
  });
});
