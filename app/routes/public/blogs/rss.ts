import type { LoaderFunctionArgs } from "react-router";
import { identity } from "~/core/identity";
import { firesio } from "~/firesio.server";

/** `/blogs/rss.xml`: the blog's RSS feed. */
export const loader = (args: LoaderFunctionArgs) => firesio.cms.rss(args, "blogs", identity.name);
