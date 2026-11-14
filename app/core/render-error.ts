/**
 * What to log when React reports an error while streaming a document.
 *
 * `entry.server` aborts the render itself once `streamTimeout` has passed, and React then reports that abort as an
 * error: a `DOMException` that `console.error` prints as a multi-line object with a stack that points at our own
 * `controller.abort()`, nothing about the page that was slow. A deliberate timeout is one structured line naming the
 * path (never the query string: an embedded request carries `id_token` and `hmac` in it); anything else is a real
 * failure and keeps its full error.
 */
export function renderErrorLog(
  error: unknown,
  context: { readonly aborted: boolean; readonly pathname: string; readonly timeoutMs: number },
): { readonly kind: "timeout"; readonly line: string } | { readonly kind: "error"; readonly error: unknown } {
  const timedOut = context.aborted && error instanceof DOMException && error.name === "AbortError";
  if (!timedOut) return { kind: "error", error };
  return {
    kind: "timeout",
    line: JSON.stringify({ event: "render.stream_timeout", path: context.pathname, afterMs: context.timeoutMs }),
  };
}
