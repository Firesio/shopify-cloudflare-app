import type { LoaderFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/**
 * A public liveness and readiness probe: no session, no data about any shop (`firesio.healthz`). 200 while D1 and KV answer, 503 when one does not, with the
 * deploy's version and the latency of each; it names an error's kind, never its text, and never calls Shopify. GET and HEAD only. The portal asks it every five
 * minutes through the service binding and tells staff when it fails twice in a row; an uptime monitor may call it too.
 */
export const loader = ({ request }: Pick<LoaderFunctionArgs, "request">) => firesio.healthz(request);
