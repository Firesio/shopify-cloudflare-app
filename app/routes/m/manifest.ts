import type { LoaderFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/** `GET /m/manifest.webmanifest?shop=`: the web app manifest of one shop's phone app. Public: a browser fetches a manifest without the page's cookies. */
export const loader = ({ request }: Pick<LoaderFunctionArgs, "request">) => firesio.devices().manifest(request);
