import { verifyUnsubscribeToken } from "~/lib/unsubscribe-token";
import type { CampaignUnsubscribes } from "~/ports/campaigns";

/**
 * What the unsubscribe page shows, decided from the link alone. The address is masked: the page is reached by a link,
 * and whoever holds a forwarded link should be able to stop the mail without being told whose address it is.
 */
export type UnsubscribeLink = { readonly kind: "invalid" } | { readonly kind: "valid"; readonly address: string; readonly masked: string };

/** `ada@firesio.app` as `a***@firesio.app`. Anything without an `@` is masked whole. */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) return "***";
  return `${address.slice(0, 1)}***${address.slice(at)}`;
}

export async function readUnsubscribeLink(token: string, secret: string): Promise<UnsubscribeLink> {
  const address = await verifyUnsubscribeToken({ secret, token });
  return address === undefined ? { kind: "invalid" } : { kind: "valid", address, masked: maskAddress(address) };
}

/**
 * Records the unsubscribe. Only a POST reaches here: a GET that unsubscribes would be fired by mail scanners and link
 * previews that open every link in a message. Asking twice is the same as asking once.
 */
export async function confirmUnsubscribe(
  input: { readonly token: string; readonly secret: string; readonly now: number },
  dependencies: { readonly unsubscribes: CampaignUnsubscribes },
): Promise<UnsubscribeLink> {
  const link = await readUnsubscribeLink(input.token, input.secret);
  if (link.kind === "valid") await dependencies.unsubscribes.add(link.address, "link", input.now);
  return link;
}
