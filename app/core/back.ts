/**
 * The page a POS "Back" button goes to: the parent of the page being shown, or `null` on the app's home (no button). Only the app knows
 * its route tree, so this is the app's (`@firesio/app/ui/surface`: `AppSurface back={...}`). A page added under a section without
 * a line here goes back to the home page, which is always a valid place to land.
 */
const SECTIONS: readonly string[] = ["/app/support", "/app/members"];

export function backOf(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/app" || path === "") return null;
  const section = SECTIONS.find((prefix) => path.startsWith(`${prefix}/`));
  return section ?? "/app";
}
