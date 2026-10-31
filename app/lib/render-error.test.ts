import { describe, expect, it } from "vitest";
import { renderErrorLog } from "./render-error";

const context = { aborted: true, pathname: "/app/offers", timeoutMs: 6000 };

describe("renderErrorLog", () => {
  it("turns our own abort into one structured line with the path and no query", () => {
    const result = renderErrorLog(new DOMException("The operation was aborted", "AbortError"), context);
    expect(result).toEqual({
      kind: "timeout",
      line: '{"event":"render.stream_timeout","path":"/app/offers","afterMs":6000}',
    });
  });

  it("keeps the full error for an AbortError nobody asked for", () => {
    const error = new DOMException("aborted by the client", "AbortError");
    expect(renderErrorLog(error, { ...context, aborted: false })).toEqual({ kind: "error", error });
  });

  it("keeps the full error for any other failure, even after the abort", () => {
    const error = new TypeError("x is not a function");
    expect(renderErrorLog(error, context)).toEqual({ kind: "error", error });
  });
});
