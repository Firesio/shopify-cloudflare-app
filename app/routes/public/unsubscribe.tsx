import { data, Form, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requestTranslator } from "~/i18n/request.server";
import { firesio } from "~/firesio.server";

/**
 * The page an unsubscribe link of a mail sent on consent opens (`/unsubscribe?t=<signed token>`): public on purpose, a person must always be able to stop a
 * mail, and the token is signed by the kernel (`NOTIFY_SECRET`), so there is no session and no shop to read. A GET only SHOWS a button and changes nothing
 * (mail scanners open every link); a POST unsubscribes, from this page's button or as a mail client's one-click POST (RFC 8058, the `List-Unsubscribe` headers
 * every consent mail carries). A forged or damaged link answers 400 and says so. The kernel builds the link from `SHOPIFY_APP_URL` and `/unsubscribe`, and the
 * layout of every consent mail shows it (`app/notifications/layout.tsx`). A consent mail needs a sender that accepts consent: Cloudflare Email carries
 * transactional mail only, so until the app declares such a sender and a list, nothing links here.
 */
const wordsOf = (request: Request) => {
  const { t } = requestTranslator(request);
  return { title: t("unsubscribe.title"), intro: t("unsubscribe.intro"), confirm: t("unsubscribe.confirm"), done: t("unsubscribe.done"), invalid: t("unsubscribe.invalid") };
};

export const loader = async ({ request }: Pick<LoaderFunctionArgs, "request">) => ({ page: await firesio.unsubscribe.loader(request), words: wordsOf(request) });

export const action = async ({ request }: Pick<ActionFunctionArgs, "request">) => {
  const answer = await firesio.unsubscribe.action(request);
  return data({ done: answer.ok }, { status: answer.status });
};

export default function Unsubscribe() {
  const { page, words } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <section className="section">
      <div className="prose stack">
        <h1>{words.title}</h1>
        {!page.valid || result?.done === false ? (
          <p className="notice notice--warning" role="alert">{words.invalid}</p>
        ) : result?.done === true ? (
          <p className="notice" role="status">{words.done}</p>
        ) : (
          <Form method="post" className="stack">
            <p>{words.intro}</p>
            <button type="submit" className="btn btn--primary">{words.confirm}</button>
          </Form>
        )}
      </div>
    </section>
  );
}
