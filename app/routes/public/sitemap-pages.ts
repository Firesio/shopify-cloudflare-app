import type { LoaderFunctionArgs } from "react-router";
import { PUBLIC_PATHS } from "~/core/seo";
import { firesio } from "~/firesio.server";

/** `/sitemap-pages.xml`: the app's own pages, each in every language with its translations (`xhtml:link`). */
export const loader = (args: LoaderFunctionArgs) => firesio.pagesSitemap(args, PUBLIC_PATHS);
