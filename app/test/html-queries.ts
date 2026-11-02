/**
 * Small readers over server-rendered HTML, so a render test can tie a value to the label or region it belongs to
 * (testing.md: a global substring match for a number can pass when the same digits appear elsewhere).
 */

/** The rest of an opening tag. Quote-aware: a class such as `has-[>svg]:px-3` contains a `>` that does not end the tag. */
const ATTRS = '(?:[^>"]|"[^"]*")*';
const ICON = "(?:<svg[^>]*>(?:(?!</svg>).)*</svg>)?";

/** The text inside `<dd>` that follows the `<dt>` with exactly this label. */
export function definitionOf(html: string, label: string): string {
  const match = new RegExp(`<dt${ATTRS}>${escape(label)}</dt><dd${ATTRS}>([^<]*)</dd>`).exec(html);
  if (match === null) throw new Error(`no definition labelled "${label}"`);
  return match[1] ?? "";
}

/** The opening tag of the form control a `<label>` with this text points at (by `for`/`id`). */
export function controlLabelled(html: string, label: string): string {
  const labelTag = new RegExp(`<label(?:[^>"]|"[^"]*")*?for="([^"]+)"${ATTRS}>${escape(label)}</label>`).exec(html);
  if (labelTag === null) throw new Error(`no label "${label}"`);
  return tagWithId(html, labelTag[1] ?? "");
}

/** The text a `<textarea>` with this id holds. */
export function textareaValue(html: string, id: string): string {
  const match = new RegExp(`<textarea${ATTRS}\\sid="${escape(id)}"${ATTRS}>([^<]*)</textarea>`).exec(html);
  if (match === null) throw new Error(`no textarea ${id}`);
  return match[1] ?? "";
}

/** The opening tag of the first button whose text starts with `text` (an icon before the text is skipped). */
export function buttonNamed(html: string, text: string): string | undefined {
  const match = new RegExp(`<button${ATTRS}>${ICON}${escape(text)}`).exec(html);
  return match === null ? undefined : new RegExp(`^<button${ATTRS}>`).exec(match[0])?.[0];
}

/** The opening tag of the element with this id. */
export function tagWithId(html: string, id: string): string {
  const match = new RegExp(`<[a-z]+${ATTRS}\\sid="${escape(id)}"${ATTRS}>`).exec(html);
  if (match === null) throw new Error(`no element with id ${id}`);
  return match[0];
}

/** The opening tag that carries this exact attribute, written as `name="value"`. */
export function tagWithAttribute(html: string, attribute: string): string {
  const match = new RegExp(`<[a-z]+(?:[^>"]|"[^"]*")*?${escape(attribute)}${ATTRS}>`).exec(html);
  if (match === null) throw new Error(`no element with ${attribute}`);
  return match[0];
}

/** Whether an opening tag carries the `disabled` attribute (not just a `disabled:` utility class). */
export function isDisabled(tag: string): boolean {
  return /\sdisabled(=""|\s|>)/.test(tag.replace(/"[^"]*"/g, '""'));
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
