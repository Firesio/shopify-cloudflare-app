import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { languageCookie, languageOf } from "~/i18n/i18n.server";
import { safeReturnPath } from "~/lib/same-origin";

/**
 * Persists a language choice from the public switcher, then returns the visitor
 * to where they were. Action-only: there is nothing to render. (`/locale` and the
 * `locale` cookie are wire names, kept as they are.)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  // Untrusted input from a form — narrow it, never trust the raw value.
  const language = languageOf(form.get("locale"));

  // Only a path on this site: the field is attacker-controllable, and an absolute URL, `//host` or `/\host` would be an
  // open redirect.
  return redirect(safeReturnPath(form.get("returnTo")), {
    headers: { "Set-Cookie": await languageCookie.serialize(language) },
  });
};

/** Never rendered; a GET here is a misuse. */
export const loader = () => redirect("/");
