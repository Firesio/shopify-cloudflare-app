import { useTranslation } from "react-i18next";
import type { AccessRefusal } from "~/domain/member-admission";
import type { TeamContact } from "~/domain/member-team";
import { formatList } from "~/i18n/format";
import { useLanguage } from "~/i18n/useLanguage";

/**
 * The keys for each reason, as literals: `t()` is typed against the `en` files, so a reason with no message fails the
 * build instead of showing a raw key to a merchant (@rules/i18n.md).
 */
const MESSAGES = {
  pending: { heading: "noAccess.pending.heading", body: "noAccess.pending.body" },
  removed: { heading: "noAccess.removed.heading", body: "noAccess.removed.body" },
  not_invited: { heading: "noAccess.not_invited.heading", body: "noAccess.not_invited.body" },
  forbidden: { heading: "noAccess.forbidden.heading", body: "noAccess.forbidden.body" },
} as const satisfies Record<AccessRefusal, { readonly heading: string; readonly body: string }>;

/**
 * What a person sees when they are signed in to Shopify but the app will not let them in, or not onto this page. Says why
 * and who can change it; the app never shows a bare error for a person who simply is not allowed.
 */
export function NoAccess({ reason, contacts = [] }: { readonly reason: AccessRefusal; readonly contacts?: readonly TeamContact[] }) {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  // "Ada (ada@shop.com)", or whichever of the two is known: the one thing a person kept out needs is someone to ask.
  const who = formatList(language, contacts.map((contact) => (contact.name && contact.email ? `${contact.name} (${contact.email})` : (contact.name ?? contact.email ?? ""))));
  const heading = t(MESSAGES[reason].heading);
  return (
    <s-page heading={t("noAccess.pageHeading")} inlineSize="base">
      <s-section accessibilityLabel={heading}>
        <s-empty-state heading={heading}>
          <s-icon slot="graphic" type="lock"></s-icon>
          <s-text slot="subheading">{t(MESSAGES[reason].body)}</s-text>
        </s-empty-state>
        {contacts.length > 0 && <s-paragraph color="subdued">{t("noAccess.contact", { who })}</s-paragraph>}
      </s-section>
    </s-page>
  );
}
