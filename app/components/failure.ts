import type { ErrorResponse } from "react-router";
import { isRouteErrorResponse } from "react-router";

/** What the root error page says: the status, a short line, an optional explanation and (development only) the technical detail. */
export type Failure = Readonly<{ status: number; title: string; message: string | null; detail: string | null }>;

const TITLES: Readonly<Record<number, string>> = {
  400: "Bad request",
  401: "Sign in required",
  403: "You cannot open this page",
  404: "Page not found",
  410: "This address is no longer available",
  413: "That message is too large",
};

/**
 * The root error page's content. A route error response keeps its own status; anything thrown that is not a response is a 500.
 * The detail (a response's body, an error's stack) is returned ONLY when `development` is true: a production page never says
 * more than the status and a short line, so a stack or an internal message never reaches a visitor.
 */
export function failureOf(error: unknown, development: boolean): Failure {
  if (isRouteErrorResponse(error)) {
    if (isBlocked(error)) return { status: 403, title: "This account is unavailable", message: "Access to the app was turned off for this store. Contact support if you think this is a mistake.", detail: null };
    const title = TITLES[error.status] ?? (error.status >= 500 ? "Something went wrong" : "This request could not be completed");
    return { status: error.status, title, message: null, detail: development && typeof error.data === "string" && error.data !== "" ? error.data : null };
  }
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return { status: 500, title: "Something went wrong", message: null, detail: development ? stack : null };
}

/**
 * The guard's refusal of a blocked shop: a 403 whose data says `{ reason: "blocked" }` (`@firesio/app`, `preset/guard`). It is
 * thrown from the /app middleware, which no layout boundary can catch while the root has a loader (the router hands a middleware
 * error to the boundary of the shallowest route with a loader), so the root page has to explain it.
 */
export function isBlocked(error: ErrorResponse): boolean {
  return error.status === 403 && typeof error.data === "object" && error.data !== null && "reason" in error.data && error.data.reason === "blocked";
}
