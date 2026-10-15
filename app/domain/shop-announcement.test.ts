import { describe, expect, it } from "vitest";
import type { ShopRelationshipFacts } from "~/domain/webhook-ordering";
import { decideInstallAnnouncement } from "./shop-announcement";

function facts(over: Partial<ShopRelationshipFacts>): ShopRelationshipFacts {
  return {
    relationshipStatus: "INSTALLED",
    relationshipOccurredAt: 1_000,
    relationshipExternalId: "install:1000",
    installedAt: 1_000,
    currentInstalledAt: 1_000,
    uninstalledAt: null,
    ...over,
  };
}

describe("decideInstallAnnouncement", () => {
  it("announces a shop the app has no record of, as the new occasion", () => {
    expect(decideInstallAnnouncement(undefined)).toEqual({ announce: true, occasion: "new" });
  });

  it.each([
    ["installed", facts({ relationshipStatus: "INSTALLED" })],
    ["reactivated", facts({ relationshipStatus: "REACTIVATED" })],
    ["deactivated", facts({ relationshipStatus: "DEACTIVATED" })],
    // A row from before lifecycle tracking, with no uninstall time: read as installed.
    ["an installed row with no recorded status", facts({ relationshipStatus: null, relationshipOccurredAt: null, relationshipExternalId: null })],
  ])("does not announce a session minted for a shop already %s (a token renewal)", (_name, before) => {
    expect(decideInstallAnnouncement(before)).toEqual({ announce: false });
  });

  it("announces a shop that had uninstalled, anchored on that uninstall", () => {
    const before = facts({ relationshipStatus: "UNINSTALLED", relationshipOccurredAt: 7_000, uninstalledAt: 7_000, currentInstalledAt: null });
    expect(decideInstallAnnouncement(before)).toEqual({ announce: true, occasion: "7000" });
  });

  it("reads a pre-lifecycle row that carries an uninstall time as uninstalled", () => {
    const before = facts({ relationshipStatus: null, relationshipOccurredAt: null, relationshipExternalId: null, uninstalledAt: 4_000, currentInstalledAt: null });
    expect(decideInstallAnnouncement(before)).toEqual({ announce: true, occasion: "4000" });
  });

  it("gives every observer of the same reinstall the same occasion", () => {
    // Two page loads that both read the shop before either recorded the reinstall must agree, so the dedupe key matches.
    const before = facts({ relationshipStatus: "UNINSTALLED", relationshipOccurredAt: 9_000, uninstalledAt: 9_000, currentInstalledAt: null });
    expect(decideInstallAnnouncement(before)).toEqual(decideInstallAnnouncement(before));
  });
});
