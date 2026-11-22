import type { Layout } from "@firesio/app/notify";
import type { AppServices } from "~/core/app-services";
import { asNode, Unsubscribe } from "@firesio/app/ui/email";
import { Body, Container, Head, Hr, Html, Img, Preview, Text } from "@react-email/components";
import { identity } from "~/core/identity";
import { I18N } from "~/i18n";

/**
 * The app's frame around EVERY mail it sends, the package's own (a support reply, an invitation, the seats notice) included: the logo, the body,
 * the footer. A pure React Email component (the kernel renders it twice, to HTML and to plain text); the words come from the catalogue
 * (`mail.layout.*`, `app/i18n/locales`), in the language of the send.
 *
 * It MUST show `unsubscribeUrl` when it is not null: a mail sent on consent (a campaign, news) is refused at render without it. A transactional
 * mail has none. A derived app edits this file freely: its colours, its logo, its postal address under the words (a consent mail to customers needs one).
 */
export const layout: Layout<AppServices> = {
  component(props) {
    const { t } = I18N.translator(props.locale);
    return (
      <Html lang={props.locale}>
        <Head />
        {props.preheader === null ? null : <Preview>{props.preheader}</Preview>}
        <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f4f4f5", margin: 0, padding: "24px 0" }}>
          <Container style={{ maxWidth: 560, backgroundColor: "#ffffff", padding: 24, borderRadius: 8 }}>
            <Img src={identity.logo} alt={identity.name} height={40} />
            {asNode(props.children)}
            <Hr />
            <Text style={{ fontSize: 12, color: "#6b7280" }}>{t("mail.layout.sentBy", { app: identity.name })}</Text>
            {props.unsubscribeUrl === null ? null : <Unsubscribe url={props.unsubscribeUrl} label={t("mail.layout.unsubscribe")} />}
          </Container>
        </Body>
      </Html>
    );
  },
};
