import { isRouteErrorResponse } from "react-router";
import { z } from "zod";
import { isAccessRefusal, type AccessRefusal } from "~/domain/member-admission";
import type { TeamContact } from "~/domain/member-team";
import { thrownResponseHtml } from "~/lib/thrown-response";

/** What the /app layout's error boundary shows for whatever a child route threw. */
export type LayoutErrorView =
  | { readonly kind: "bounce"; readonly html: string }
  | { readonly kind: "refusal"; readonly reason: AccessRefusal; readonly contacts: readonly TeamContact[] }
  | { readonly kind: "member_missing" }
  | { readonly kind: "rethrow" };

const contactsSchema = z.array(z.object({ name: z.string().nullable(), email: z.string().nullable() }));

/** The contacts a guard refusal carries, or undefined when it carries none or they are damaged. */
export function parseRefusalContacts(value: unknown): readonly TeamContact[] | undefined {
  const parsed = contactsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Where a person's own page lives; a 404 under it means that person is no longer on this shop's team. */
const MEMBER_PAGE_PREFIX = "/app/members/";

/**
 * Decides what the layout's boundary renders. Pure: the thrown value and the address are all it reads.
 *   a 2xx the library threw      the App Bridge bounce page (a session token on its way)
 *   the guard's 403              the page that says why and who to ask
 *   a 404 on a member's page     "that person is no longer on the team", with the way back
 *   anything else                rethrown, so the root boundary shows the real failure
 */
export function layoutErrorView(error: unknown, pathname: string): LayoutErrorView {
  const html = thrownResponseHtml(error);
  if (html !== null) return { kind: "bounce", html };
  if (!isRouteErrorResponse(error)) return { kind: "rethrow" };
  if (error.status === 404 && pathname.startsWith(MEMBER_PAGE_PREFIX)) return { kind: "member_missing" };
  if (error.status !== 403 || typeof error.data !== "object" || error.data === null) return { kind: "rethrow" };
  const reason = "reason" in error.data ? error.data.reason : undefined;
  if (!isAccessRefusal(reason)) return { kind: "rethrow" };
  const contacts = "contacts" in error.data ? parseRefusalContacts(error.data.contacts) : undefined;
  return { kind: "refusal", reason, contacts: contacts ?? [] };
}
