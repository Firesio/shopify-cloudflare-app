import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, revealFirstError } from "~/admin/first-error";
import { trackDirty, type DirtyTracker } from "~/admin/form-dirty";

/**
 * Hides the bar. The host rejects with "SaveBar with ID ... not found" when it already removed the bar (a save or a
 * navigation tore it down first); a bar that is gone is the state wanted, so that one rejection ends here.
 */
function hideSaveBar(id: string): void {
  void Promise.resolve(globalThis.shopify?.saveBar?.hide?.(id)).catch(
    () => undefined,
  );
}

/**
 * The save bar of the form it sits in, the programmatic way Shopify documents (the Save Bar API: a `<ui-save-bar>`
 * with a primary Save and a Discard, shown and hidden with `shopify.saveBar.show(id)` / `hide(id)`).
 *
 * `data-save-bar` hides the bar the instant the form is submitted, which is wrong when the server then refuses the
 * save: the edits are still there and the bar is not. Here the bar is up while the form differs from where it
 * started and goes away only when a save went through or the merchant discarded. A refused save changes nothing on
 * the bar: Save stops loading and the page shows the reason (inline under the field, a critical banner on top).
 *
 * Put it inside the form, with the page's action result (a new object per completed submission). Save asks the
 * form to submit (so the browser checks `required` and the rest first); Discard resets the form, which the page
 * answers on `onReset`. Verified by hand: the bar itself is host chrome; the rules above are unit-tested against a
 * faked `shopify.saveBar`.
 *
 * A refused save also takes the merchant to the first field the server refused (`revealFirstError`), once per answer.
 *
 * `startDirty`: the page was opened with a draft the merchant has not saved (an AI draft carried in). The values loaded
 * from it are unsaved changes even though no field was touched, so the bar is up from the start and stays up whatever
 * the merchant types, until a save goes through or they discard. Discard then also calls `onDiscard`, so the page
 * can drop the draft (a plain reset would only put the draft's own values back).
 */
export function FormSaveBar(props: {
  /** Unique on the page. */
  readonly id: string;
  /** The page's action result: a new object for every completed submission, `undefined` before any. */
  readonly result: object | undefined;
  /** That result is a refusal. */
  readonly refused: boolean;
  /** A request of the page is in flight. */
  readonly busy: boolean;
  readonly saveLabel: string;
  readonly discardLabel: string;
  /** Ask the merchant to confirm before their edits are thrown away. */
  readonly discardConfirmation?: boolean;
  /** The page carries an unsaved draft: the bar is up from the start. See above. */
  readonly startDirty?: boolean;
  /**
   * The page decides whether the form changed, instead of the bar watching the fields. For a form whose controls change
   * each other (choosing a role fills the permissions): a value a script wrote is not something the bar can see, so the
   * page, which holds the draft, says. Absent, the bar watches the fields as it always did.
   */
  readonly dirty?: boolean;
  /** Discard was pressed: the page drops the draft it carried. */
  readonly onDiscard?: () => void;
}) {
  const { id } = props;
  // A carried draft is a change until a save or a discard; it follows the prop going false (the page dropped it).
  const [carried, setCarried] = useState(props.startDirty === true);
  if (carried && props.startDirty !== true) setCarried(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const tracker = useRef<DirtyTracker | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const seen = useRef(props.result);
  // A request that ended without an answer (the network failed) is over: Save stops loading. React's "adjust
  // state while rendering" pattern, once per change of `busy`.
  const [wasBusy, setWasBusy] = useState(props.busy);
  if (props.busy !== wasBusy) {
    setWasBusy(props.busy);
    if (!props.busy && submitting) setSubmitting(false);
  }

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (form === null || form === undefined) return;
    const onSubmit = () => {
      submitted.current = true;
      setSubmitting(true);
    };
    form.addEventListener("submit", onSubmit);
    tracker.current = trackDirty(form, setDirty);
    setReady(true);
    return () => {
      form.removeEventListener("submit", onSubmit);
      tracker.current?.dispose();
      tracker.current = null;
      hideSaveBar(id);
    };
  }, [id]);

  const changed = props.dirty ?? dirty;
  useEffect(() => {
    if (!ready) return;
    const saveBar = globalThis.shopify?.saveBar;
    if (changed || carried) void saveBar?.show?.(id);
    else hideSaveBar(id);
  }, [ready, changed, carried, id]);

  useEffect(() => {
    if (props.result === undefined || props.result === seen.current) return;
    seen.current = props.result;
    const ownSave = submitted.current;
    submitted.current = false;
    setSubmitting(false);
    if (ownSave && !props.refused) {
      tracker.current?.rebaseline();
      setCarried(false);
    }
    // A refusal takes the merchant to what is wrong: the first field with an error, else the critical banner on top.
    const form = anchor.current?.closest("form");
    if (ownSave && props.refused && form !== null && form !== undefined) {
      revealFirstError(form, { reducedMotion: prefersReducedMotion() });
    }
  }, [props.result, props.refused]);

  const form = () => anchor.current?.closest("form") ?? null;
  return (
    <>
      <span hidden data-form-save-bar="" ref={anchor} />
      {ready ? (
        <ui-save-bar id={id} discardConfirmation={props.discardConfirmation}>
          <button
            type="button"
            variant="primary"
            loading={submitting && props.busy ? "" : undefined}
            onClick={() => form()?.requestSubmit()}
          >
            {props.saveLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              form()?.reset();
              tracker.current?.rebaseline();
              setCarried(false);
              props.onDiscard?.();
            }}
          >
            {props.discardLabel}
          </button>
        </ui-save-bar>
      ) : null}
    </>
  );
}
