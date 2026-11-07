// Whether a form differs from where it started, the way the admin's `data-save-bar` decides it: a field the
// merchant touched (an `input`, `change` or `valuemodified` event) whose value now differs from the value it had
// when it was first seen. A value a script changed without the merchant touching the field is not a change.
// Used by the programmatic save bar (`FormSaveBar`), which shows the bar while this is true and hides it only
// when a save succeeded or the merchant discarded.

export interface DirtyTracker {
  isDirty(): boolean;
  /** Take the current values as the starting point (a save succeeded) and say the form is clean. */
  rebaseline(): void;
  dispose(): void;
}

type Control = Element & {
  value?: unknown;
  values?: unknown;
  checked?: unknown;
};

/** What a control holds now: `checked` for a checkbox or radio, `values` for a choice list, its value for everything else. */
function valueOf(control: Control): string {
  if (Array.isArray(control.values)) return JSON.stringify(control.values);
  if (
    control instanceof HTMLInputElement &&
    (control.type === "checkbox" || control.type === "radio")
  ) {
    return control.checked ? "on" : "off";
  }
  if (
    !(control instanceof HTMLInputElement) &&
    typeof control.checked === "boolean"
  )
    return control.checked ? "on" : "off";
  return typeof control.value === "string" ? control.value : "";
}

const CHANGE_EVENTS = ["input", "change", "valuemodified"] as const;

export function trackDirty(
  form: HTMLFormElement,
  onChange: (dirty: boolean) => void,
): DirtyTracker {
  const start = new Map<Element, string>();
  const touched = new Set<Element>();
  let dirty = false;

  const remember = (control: Element): void => {
    if (!start.has(control)) start.set(control, valueOf(control));
  };
  const snapshot = (): void => {
    start.clear();
    touched.clear();
    for (const control of Array.from(form.elements)) remember(control);
  };
  const differs = (): boolean =>
    Array.from(touched).some(
      (control) => start.get(control) !== valueOf(control),
    );
  const settle = (): void => {
    const now = differs();
    if (now === dirty) return;
    dirty = now;
    onChange(now);
  };

  /** A control in a region marked `data-save-bar-ignore` acts on its own (an upload saves at once): it is not an edit of the form. */
  const ignored = (target: Element): boolean =>
    target.closest("[data-save-bar-ignore]") !== null;
  const onFocus = (event: Event): void => {
    if (event.target instanceof Element && !ignored(event.target)) {
      remember(event.target);
    }
  };
  const onEdit = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || ignored(target)) return;
    remember(target);
    touched.add(target);
    settle();
  };

  snapshot();
  form.addEventListener("focusin", onFocus);
  form.addEventListener("beforeinput", onFocus);
  for (const type of CHANGE_EVENTS) form.addEventListener(type, onEdit);

  return {
    isDirty: () => dirty,
    rebaseline: () => {
      snapshot();
      settle();
    },
    dispose: () => {
      form.removeEventListener("focusin", onFocus);
      form.removeEventListener("beforeinput", onFocus);
      for (const type of CHANGE_EVENTS) form.removeEventListener(type, onEdit);
    },
  };
}
