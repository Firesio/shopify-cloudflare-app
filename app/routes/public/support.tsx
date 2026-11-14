import { CONTACT_TRAP_FIELD, parseContactForm, type ContactField, type ContactFieldError } from "@firesio/support";
import type { ActionFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { identity } from "~/core/identity";
import { services } from "~/wiring/services";

export const loader = () => ({ turnstileSiteKey: services().env.TURNSTILE_SITE_KEY });

const FAILURES: Readonly<Record<string, string>> = {
  rate_limited: "You have sent several messages in a short time. Try again in a minute.",
  bot_check_failed: "We could not confirm you are a person. Try again.",
  bot_check_unavailable: "We could not check your message right now. Try again in a moment.",
};

const FIELD_ERRORS: Record<ContactFieldError, string> = { required: "This field is required.", too_long: "This is too long.", email: "Enter a valid email address.", shop: "Use a store address like your-store.myshopify.com." };

/** Parse at the edge, then the library decides: the trap, the limiter, Turnstile, the inbox. A filled trap looks like success. */
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const parsed = parseContactForm(form);
  if (parsed.kind === "trap") return { sent: true as const };
  if (parsed.kind === "invalid") return { errors: parsed.errors, values: parsed.values };
  const token = form.get("cf-turnstile-response");
  const result = await services().contact.submit(parsed.input, { ip: request.headers.get("CF-Connecting-IP"), turnstileToken: typeof token === "string" ? token : null });
  return result.ok ? { sent: true as const } : { failure: result.reason };
}

const LABELS: Record<ContactField, string> = { name: "Your name", email: "Your email", subject: "Subject", message: "How can we help?", shop: "Store domain (optional)" };

function Field({ name, value, error }: { readonly name: Exclude<ContactField, "message">; readonly value: string; readonly error: ContactFieldError | undefined }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={`contact-${name}`}>{LABELS[name]}</label>
      <input className="field__input" id={`contact-${name}`} name={name} type={name === "email" ? "email" : "text"} defaultValue={value} required={name !== "shop"} aria-invalid={error !== undefined} />
      {error === undefined ? null : <p className="field__error" role="alert">{FIELD_ERRORS[error]}</p>}
    </div>
  );
}

function ContactForm({ siteKey }: { readonly siteKey: string }) {
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";
  const values = result !== undefined && "values" in result ? result.values : undefined;
  const errors: Partial<Record<ContactField, ContactFieldError>> = result !== undefined && "errors" in result && result.errors !== undefined ? result.errors : {};
  return (
    <Form method="post" className="stack">
      {result !== undefined && "failure" in result ? <p className="notice notice--danger" role="alert">{(result.failure === undefined ? undefined : FAILURES[result.failure]) ?? "We could not send your message. Try again."}</p> : null}
      <Field name="name" value={values?.name ?? ""} error={errors.name} />
      <Field name="email" value={values?.email ?? ""} error={errors.email} />
      <Field name="subject" value={values?.subject ?? ""} error={errors.subject} />
      <div className="field">
        <label className="field__label" htmlFor="contact-message">{LABELS.message}</label>
        <textarea className="field__input field__input--multiline" id="contact-message" name="message" required defaultValue={values?.message ?? ""} aria-invalid={errors.message !== undefined} />
        {errors.message === undefined ? null : <p className="field__error" role="alert">{FIELD_ERRORS[errors.message]}</p>}
      </div>
      <Field name="shop" value={values?.shop ?? ""} error={errors.shop} />
      <div className="field field--trap" aria-hidden="true">
        <label htmlFor="contact-trap">Website</label>
        <input id="contact-trap" name={CONTACT_TRAP_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {siteKey === "" ? null : <div className="cf-turnstile" data-sitekey={siteKey} />}
      {siteKey === "" ? null : <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Sending..." : "Send"}</button>
    </Form>
  );
}

/** The public support page: the App Store checklist expects real support resources linked from the listing. */
export default function Support() {
  const { turnstileSiteKey } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const sent = result !== undefined && "sent" in result;
  return (
    <section className="section">
      <div className="prose stack">
        <h1>Support</h1>
        <p className="muted">Help with {identity.name}</p>
        <p className="notice notice--warning">Placeholder. Replace with real, Shopify-specific help: setup steps, common problems and how to reach you.</p>
        <h2>Send us a message</h2>
        <p className="muted">Tell us what you need and we will reply by email.</p>
        {sent ? <p className="notice" role="status">Thank you. We will reply by email.</p> : <ContactForm siteKey={turnstileSiteKey} />}
      </div>
    </section>
  );
}
