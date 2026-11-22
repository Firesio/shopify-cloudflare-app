import { Button, Heading, Text } from "@react-email/components";
import { z } from "zod";
import { identity } from "~/core/identity";
import { kit } from "../kit";

/**
 * The sample message: a welcome mail to the shop when the app is installed (`on.installed` in `app/firesio.server.ts` sends it). A message is
 * its id, the shape of its data (a zod schema: a typo in `send` does not compile) and, for the email channel, a subject and a React Email body.
 * Every text goes through `words.t(key)`: the keys are in `app/i18n/locales/<language>/app.json` (`mail.welcome.*`), so the mail speaks the language
 * of the shop. It is transactional (no consent needed) and goes out on the `notifications` stream (Cloudflare Email, `notification@<app domain>`).
 *
 * To make a message a merchant may reword, list the keys: `editable: ["app:mail.welcome.body"]` (`removable` for a part they may hide).
 */
export const welcome = kit.defineMessage({
  id: "welcome",
  vars: z.object({ shopName: z.string(), appUrl: z.string() }),
  email: {
    subject: ({ vars, words }) => words.t("mail.welcome.subject", { app: identity.name, shop: vars.shopName }),
    preheader: ({ vars, words }) => words.t("mail.welcome.preheader", { app: identity.name, shop: vars.shopName }),
    body: ({ vars, words }) => (
      <>
        <Heading as="h1" style={{ fontSize: 22 }}>
          {words.t("mail.welcome.heading", { app: identity.name })}
        </Heading>
        <Text>{words.t("mail.welcome.body", { app: identity.name, shop: vars.shopName })}</Text>
        <Button href={vars.appUrl} style={{ backgroundColor: "#18181b", color: "#ffffff", padding: "10px 18px", borderRadius: 6 }}>
          {words.t("mail.welcome.cta")}
        </Button>
        <Text style={{ color: "#6b7280" }}>{words.t("mail.welcome.help")}</Text>
      </>
    ),
  },
});
