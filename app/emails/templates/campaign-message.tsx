import { Link } from "react-email";
import type { AudienceText } from "~/i18n/audience";
import type { UnitKeys } from "~/i18n/text-units";
import { paragraphsOf } from "~/domain/campaign";
import type { CampaignMessagePayload } from "~/notifications/payloads";
import { Cta, EmailLayout, Muted, P } from "../layout";
import { renderEmail, type RenderedEmail } from "../render";

/**
 * Merchant-facing: an announcement the team wrote (a coming update, a change that matters).
 *
 * The subject, text and button are the team's own words, in the language they wrote them, so they are not run
 * through the catalogue. What IS translated is what the app adds around them: why the merchant is getting this and the
 * unsubscribe link, which every announcement carries (an unsubscribe the reader cannot find is a complaint).
 */
export function campaignMessageEmail(
  p: CampaignMessagePayload,
  text: AudienceText<UnitKeys<"email.campaign">>,
): Promise<RenderedEmail> {
  const t = text.fixedT("email");
  const paragraphs = paragraphsOf(p.body);
  return renderEmail(
    p.subject,
    <EmailLayout preview={paragraphs[0] ?? p.subject} heading={p.subject} logoUrl={p.logoUrl} text={text}>
      {paragraphs.map((paragraph, index) => (
        <P key={index}>{paragraph}</P>
      ))}
      {p.ctaLabel && p.ctaUrl ? <Cta href={p.ctaUrl} text={text}>{p.ctaLabel}</Cta> : null}
      <Muted>
        {t("campaign.footer", { shopName: p.shopName })} <Link href={p.unsubscribeUrl}>{t("campaign.unsubscribe")}</Link>
      </Muted>
    </EmailLayout>,
  );
}
