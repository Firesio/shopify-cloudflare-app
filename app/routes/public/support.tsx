import { useEffect } from "react";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useTranslation } from "react-i18next";
import { audienceTextForRequest } from "~/wiring/audience.server";
import { identity } from "~/identity";
import { getEnv } from "~/request-context.server";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_TRAP_FIELD,
  type ContactField,
  type ContactFieldError,
} from "~/schemas/support-contact";
import { BODY_MAX, SUBJECT_MAX } from "~/schemas/support";
import { supportContactService } from "~/wiring.server";
import { handleContactAction } from "./support-contact.server";
import { useSupportEmail } from "./support-email";

export const handle = { i18n: ["common", "public"] };

const SENT = "/support?sent=1";
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const text = await audienceTextForRequest(request, "public.support");
  const t = text.fixedT("public");
  return {
    title: `${t("support.heading")} — ${identity.name}`,
    sent: new URL(request.url).searchParams.get("sent") === "1",
    turnstileSiteKey: getEnv().TURNSTILE_SITE_KEY,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.title ?? "" },
];

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await handleContactAction(request, { service: supportContactService() });
  if (result.kind === "sent") return redirect(SENT);
  return data({ errors: result.errors, values: result.values, failure: result.failure }, { status: result.status });
};

function FieldError({ id, error }: { readonly id: string; readonly error: ContactFieldError | undefined }) {
  const { t } = useTranslation("public");
  if (error === undefined) return null;
  return (
    <p className="field__error" id={id} role="alert">
      {t(`support.form.errors.${error}`)}
    </p>
  );
}

/** The embedded check loads Cloudflare's script once, after the page is interactive. */
function Turnstile({ siteKey }: { readonly siteKey: string }) {
  useEffect(() => {
    if (document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)) return;
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    document.head.appendChild(script);
  }, []);
  return <div className="cf-turnstile" data-sitekey={siteKey} />;
}

function ContactForm({ siteKey }: { readonly siteKey: string }) {
  const { t } = useTranslation("public");
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const errors: Readonly<Partial<Record<ContactField, ContactFieldError>>> = result?.errors ?? {};
  const values = result?.values;

  const field = (name: ContactField, max: number, type: "text" | "email" = "text") => {
    const error = errors[name];
    return (
      <div className="field">
        <label className="field__label" htmlFor={`contact-${name}`}>{t(`support.form.${name}`)}</label>
        <input
          className="field__input"
          id={`contact-${name}`}
          name={name}
          type={type}
          maxLength={max}
          required={name !== "shop"}
          defaultValue={values?.[name] ?? ""}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `contact-${name}-error`}
          autoComplete={name === "name" ? "name" : name === "email" ? "email" : "off"}
        />
        {name === "shop" ? <p className="field__hint">{t("support.form.shopHint")}</p> : null}
        <FieldError id={`contact-${name}-error`} error={error} />
      </div>
    );
  };

  return (
    <Form method="post" className="stack">
      {result?.failure ? (
        <p className="notice notice--danger" role="alert">{t(`support.form.errors.${result.failure}`)}</p>
      ) : null}
      {field("name", CONTACT_NAME_MAX)}
      {field("email", CONTACT_EMAIL_MAX, "email")}
      {field("subject", SUBJECT_MAX)}
      <div className="field">
        <label className="field__label" htmlFor="contact-message">{t("support.form.message")}</label>
        <textarea
          className="field__input field__input--multiline"
          id="contact-message"
          name="message"
          maxLength={BODY_MAX}
          required
          defaultValue={values?.message ?? ""}
          aria-invalid={errors.message !== undefined}
          aria-describedby={errors.message === undefined ? undefined : "contact-message-error"}
        />
        <FieldError id="contact-message-error" error={errors.message} />
      </div>
      {field("shop", 100)}
      <div className="field field--trap" aria-hidden="true">
        <label htmlFor="contact-trap">Website</label>
        <input id="contact-trap" name={CONTACT_TRAP_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {siteKey === "" ? null : <Turnstile siteKey={siteKey} />}
      <button className="btn btn--primary" type="submit" disabled={busy}>
        {busy ? t("support.form.sending") : t("support.form.send")}
      </button>
    </Form>
  );
}

/**
 * Public support page. The app requirements checklist expects real support
 * resources linked from the listing, and Polaris asks for a help footer on every
 * admin page pointing somewhere like this.
 * https://shopify.dev/docs/apps/launch/app-requirements-checklist
 */
export default function Support() {
  const { t } = useTranslation("public");
  const { sent, turnstileSiteKey } = useLoaderData<typeof loader>();
  const supportEmail = useSupportEmail();

  return (
    <section className="section">
      <div className="prose stack">
        <h1>{t("support.heading")}</h1>
        <p className="muted">{t("support.subheading")}</p>

        <p className="notice notice--warning">{t("support.warning")}</p>

        <h2>{t("support.gettingStarted")}</h2>
        <p>{t("support.gettingStartedBody")}</p>

        <h2>{t("support.faq")}</h2>
        <p>{t("support.faqBody")}</p>

        <h2>{t("support.contact")}</h2>
        <p>{t("support.contactBody", { email: supportEmail })}</p>

        <h2>{t("support.form.heading")}</h2>
        <p className="muted">{t("support.form.intro")}</p>
        {sent ? <p className="notice" role="status">{t("support.form.sent")}</p> : <ContactForm siteKey={turnstileSiteKey} />}
      </div>
    </section>
  );
}
