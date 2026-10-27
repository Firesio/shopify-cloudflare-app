// Which namespaces a page needs: what the MATCHED routes declare in `export const handle = { i18n: [...] }`. The server
// loads, and sends the browser, only these, so a public page never carries the admin strings.
//
// `EntryContext.routeModules` holds the module of EVERY route in the build, not only the matched ones (React Router
// hands the server all of them), so reading it whole would put every route's namespaces on every page. The matches say
// which routes this request actually renders.
import { z } from "zod";
import { BROWSER_NAMESPACES, type BrowserNamespace } from "./catalogues.generated";

const handleSchema = z.object({ i18n: z.union([z.string(), z.array(z.string())]) });

/** The part of React Router's `EntryContext` this reads (the real one satisfies it). */
export interface RouteModulesContext {
  readonly routeModules: Readonly<Record<string, { readonly handle?: unknown } | undefined>>;
  readonly staticHandlerContext: { readonly matches: readonly { readonly route: { readonly id: string } }[] };
}

/** The browser namespaces the matched routes declare, in catalogue order. An unknown or server-only name is not loadable and is left out. */
export function routeNamespaces(context: RouteModulesContext): readonly BrowserNamespace[] {
  const declared = context.staticHandlerContext.matches.flatMap((match) => {
    const handle = handleSchema.safeParse(context.routeModules[match.route.id]?.handle);
    return handle.success ? [handle.data.i18n].flat() : [];
  });
  return BROWSER_NAMESPACES.filter((namespace) => declared.includes(namespace));
}
