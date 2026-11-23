import type { LoaderFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/** `/sitemap-content.xml`: every published page of every collection, with its translations (`hreflang`). */
export const loader = (args: LoaderFunctionArgs) => firesio.cms.sitemap(args);
