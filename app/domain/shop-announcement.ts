import { relationshipOf, type ShopRelationshipFacts } from "~/domain/webhook-ordering";

/**
 * Whether a session minted for a shop is a NEW INSTALL worth telling the staff about.
 *
 * `afterAuth` fires on every new session, and offline tokens expire, so it fires again and again over a shop's life.
 * The only things that are news are a shop we have never recorded and a shop that had uninstalled. A shop the app
 * already believes is active (installed or reactivated) is a token renewal, and a deactivated one is a closed store
 * that has not come back.
 *
 * `occasion` names WHICH first/second/third install this is, so the announcement's dedupe key is the same for every
 * request that observed the same occasion — two concurrent first page loads both see "no row" and must not announce
 * twice. A never-seen shop has no earlier fact to anchor on; a reinstall anchors on the uninstall it follows.
 *
 * Pure: the caller reads the shop BEFORE recording the install, because afterwards it is always "installed".
 */
export type InstallAnnouncement =
  | { readonly announce: false }
  | { readonly announce: true; readonly occasion: string };

export function decideInstallAnnouncement(before: ShopRelationshipFacts | undefined): InstallAnnouncement {
  if (before === undefined) return { announce: true, occasion: "new" };
  const relationship = relationshipOf(before);
  return relationship.kind === "uninstalled"
    ? { announce: true, occasion: String(relationship.occurredAt) }
    : { announce: false };
}
