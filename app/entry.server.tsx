import { renderErrorLog } from "@firesio/app/shell";
import { describeRequestError } from "@firesio/app/ui/shell";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { firesio } from "~/firesio.server";

export const streamTimeout = 5000;

/**
 * React Router's server-side error hook. Logs only what `describeRequestError` returns, so unmatched-path 404s and aborted
 * requests do not bury real failures, and a request's query string (id_token, hmac) is never logged.
 */
export function handleError(error: unknown, { request }: { request: Request }): void {
  const log = describeRequestError(error, request);
  if (log !== null) console.error(JSON.stringify(log));
}

/** Workers entry: the Web Streams renderer (workerd has neither `renderToPipeableStream` nor `node:stream`). */
export default async function handleRequest(request: Request, responseStatusCode: number, responseHeaders: Headers, reactRouterContext: EntryContext) {
  // The embedded-app CSP (frame-ancestors for the shop and Shopify admin). The app's own security headers are added to every
  // response, not only to this one, by the Worker's `fetch` (workers/app.ts).
  firesio.shopify.addDocumentResponseHeaders(request, responseHeaders);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), streamTimeout + 1000);
  let didError = false;
  const stream = await renderToReadableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
    signal: controller.signal,
    onError(error: unknown) {
      didError = true;
      const log = renderErrorLog(error, { aborted: controller.signal.aborted, pathname: new URL(request.url).pathname, timeoutMs: streamTimeout + 1000 });
      if (log.kind === "timeout") console.error(log.line);
      else console.error(log.error);
    },
  });

  // Bots need the whole document (SEO, link unfurling); browsers get the shell as soon as it is ready.
  if (isbot(request.headers.get("user-agent") ?? "")) await stream.allReady;
  const stopTimer = (): void => clearTimeout(timeout);
  void stream.allReady.then(stopTimer, stopTimer);

  responseHeaders.set("Content-Type", "text/html");
  return new Response(stream, { headers: responseHeaders, status: didError ? 500 : responseStatusCode });
}
