/**
 * Whether a form post may be read at all, decided from its `Content-Length` BEFORE any byte is parsed: `request.formData()` buffers
 * the whole body, so a public form must refuse an oversized one first. Returns the status to refuse with, or `null` to go on.
 *
 * A body with no length (chunked) is refused too: a browser always sends one for a form, and a body that announces nothing is
 * exactly the one a limit on the announcement cannot bound.
 */
export function formBodyRefusal(headers: Headers, maxBytes: number): 400 | 411 | 413 | null {
  const length = headers.get("content-length");
  if (length === null) return 411;
  if (!/^\d+$/.test(length)) return 400;
  return Number(length) > maxBytes ? 413 : null;
}
