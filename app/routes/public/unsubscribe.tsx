import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useTranslation } from "react-i18next";
import { identity } from "~/identity";
import { getEnv } from "~/request-context.server";
import { paths } from "~/urls";
import { campaignUnsubscribes } from "~/wiring.server";
import { requireAttachmentTokenSecret } from "~/wiring/ai-support.server";
import { audienceTextForRequest } from "~/wiring/audience.server";
import { confirmUnsubscribe, readUnsubscribeLink } from "./unsubscribe.server";

export const handle = { i18n: ["common", "public"] };

/** A link that carries a credential in its path is never cached, and never leaked through a Referer. */
export const headers: HeadersFunction = () => ({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const text = await audienceTextForRequest(request, "public.unsubscribe");
  const link = await readUnsubscribeLink(params.token ?? "", requireAttachmentTokenSecret(getEnv()));
  return {
    title: `${text.fixedT("public")("unsubscribe.heading")} — ${identity.name}`,
    link: link.kind === "valid" ? ({ kind: "valid", masked: link.masked } as const) : ({ kind: "invalid" } as const),
    done: new URL(request.url).searchParams.get("done") === "1",
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.title ?? "" },
  // The address is in the link: nothing here belongs in a search index.
  { name: "robots", content: "noindex" },
];

export const action = async ({ params }: ActionFunctionArgs) => {
  const token = params.token ?? "";
  const result = await confirmUnsubscribe(
    { token, secret: requireAttachmentTokenSecret(getEnv()), now: Date.now() },
    { unsubscribes: campaignUnsubscribes() },
  );
  // Post/redirect/get: reloading the confirmation never asks again.
  return redirect(result.kind === "valid" ? `${paths.unsubscribe(token)}?done=1` : paths.unsubscribe(token));
};

export default function Unsubscribe() {
  const { t } = useTranslation("public");
  const { link, done } = useLoaderData<typeof loader>();
  const busy = useNavigation().state !== "idle";

  return (
    <section className="section">
      <div className="prose stack">
        <h1>{t("unsubscribe.heading")}</h1>
        {link.kind === "invalid" ? (
          <p className="notice notice--warning" role="alert">{t("unsubscribe.invalid")}</p>
        ) : done ? (
          <p className="notice" role="status">{t("unsubscribe.done", { address: link.masked })}</p>
        ) : (
          <Form method="post" className="stack">
            <p>{t("unsubscribe.intro", { address: link.masked })}</p>
            <p className="muted">{t("unsubscribe.note")}</p>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? t("unsubscribe.working") : t("unsubscribe.confirm")}
            </button>
          </Form>
        )}
      </div>
    </section>
  );
}
