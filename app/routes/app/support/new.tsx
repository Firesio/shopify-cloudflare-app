import { useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData, useNavigation, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { guardMember } from "~/admin/require-member.server";
import { settle } from "~/admin/settle.server";
import type { Outcome } from "~/admin/outcome";
import { useActionToast } from "~/admin/use-action-toast";
import { Deferred } from "~/components/admin/Deferred";
import { SkeletonStatus } from "~/components/admin/Skeleton";
import { AttachmentPicker } from "~/components/support/AttachmentPicker";
import { CcEmails, ccLabels } from "~/components/support/CcEmails";
import { pickerLabels } from "~/components/support/picker-labels";
import { submittedMerchantLanguage } from "~/i18n/i18n.server";
import { useLanguage } from "~/i18n/useLanguage";
import { BODY_MAX, SUBJECT_MAX } from "~/schemas/support";
import { CC_MAX } from "~/support/cc-list";
import { CATEGORY_LABEL_KEY, SUPPORT_CATEGORIES } from "~/support/categories";
import { fieldErrorKey, supportErrorKey } from "~/support/error-keys";
import type { FieldErrorCode, FieldErrors } from "~/support/field-errors";
import { createTicket } from "./new.server";
import { fetchShopContact } from "./shop-contact.server";
import { usePendingUploads } from "./use-pending-uploads";

export const handle = { i18n: ["common", "admin"] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authentication is awaited. The Admin API round trip only prefills one field, so the form renders at once and the
  // address streams in; if it fails (or is slow: the call is bounded) the merchant types their own, logged by `settle`.
  const { admin, session } = await guardMember(request, "app:view");
  return {
    defaultEmail: settle(
      fetchShopContact((query, options) => admin.graphql(query, options)).then((contact) => contact.email),
      { event: "admin.support.contact_email.failed", shop: session.shop, route: "app/support/new" },
    ),
    // Identifies this form: sending it twice (a double click, a retry after a lost response) files one ticket.
    submissionKey: crypto.randomUUID(),
  };
};

/**
 * A failed submission changes nothing a reload would show, and reloading would replace the key and re-ask Shopify for
 * the address (wiping what the merchant typed into the email field). Only a GET revalidates.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod, defaultShouldRevalidate }) =>
  formMethod?.toUpperCase() === "POST" ? false : defaultShouldRevalidate;

const REFUSAL_STATUS = { rate_limited: 429, invalid_upload: 400 } as const;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await guardMember(request, "app:view");
  const form = await request.formData();

  const outcome = await createTicket({
    shop: session.shop,
    form,
    // Shopify puts the merchant's chosen admin language on every embedded request, and this is the only moment we have
    // it: staff answer later from the internal console, which knows nothing about them (@rules/i18n.md). The language the
    // form was drawn in (posted by the form, since this request may not carry `?locale=`); the merchant's own parameter
    // only when the form did not send one.
    language: submittedMerchantLanguage(form.get("language"), request).code,
    graphql: (query, options) => admin.graphql(query, options),
  });

  if (outcome.kind === "invalid") return data({ fieldErrors: outcome.fieldErrors }, { status: 400 });
  if (outcome.kind === "refused") return data({ error: outcome.error }, { status: REFUSAL_STATUS[outcome.error] });

  // `?created=1` is what makes the thread page toast on arrival. The confirmation belongs on the screen the merchant
  // lands on, not on this one, which is already gone by then.
  return redirect(`/app/support/${outcome.id}?created=1`);
};

/** Translates each field's error code; the schema's own English never reaches the page. */
function useFieldMessages(fieldErrors: FieldErrors | undefined) {
  const { t } = useTranslation(["admin", "common"]);
  const message = (code: FieldErrorCode | undefined) => (code ? t(fieldErrorKey(code), { max: CC_MAX }) : undefined);
  return {
    category: message(fieldErrors?.category),
    subject: message(fieldErrors?.subject),
    body: message(fieldErrors?.body),
    merchantEmail: message(fieldErrors?.merchantEmail),
    ccEmails: message(fieldErrors?.ccEmails),
  };
}

type Messages = ReturnType<typeof useFieldMessages>;

function TicketDetailsSection({ messages, uploads }: { messages: Messages; uploads: ReturnType<typeof usePendingUploads> }) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const { labels, formatSize } = pickerLabels(t, language);
  return (
    <s-section heading={t("support.form.heading")}>
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">{t("support.form.replyExpectation")}</s-paragraph>

        <s-select label={t("support.form.category")} name="category" value="bug" error={messages.category}>
          {SUPPORT_CATEGORIES.map((category) => (
            <s-option key={category} value={category}>
              {t(CATEGORY_LABEL_KEY[category])}
            </s-option>
          ))}
        </s-select>

        <s-text-field
          label={t("support.form.subject")}
          name="subject"
          placeholder={t("support.form.subjectPlaceholder")}
          maxLength={SUBJECT_MAX}
          error={messages.subject}
          required
        ></s-text-field>

        <s-text-area
          label={t("support.form.body")}
          name="body"
          details={t("support.form.bodyHelp")}
          rows={6}
          maxLength={BODY_MAX}
          error={messages.body}
          required
        ></s-text-area>

        <AttachmentPicker uploads={uploads} labels={labels} formatSize={formatSize} />
      </s-stack>
    </s-section>
  );
}

/**
 * The email field, loaded or still loading: one markup, so the two cannot drift. The label and help line are real at once,
 * so the field keeps its height. While loading it is disabled and carries no `name`, so it can never submit a blank
 * address, and one hidden status announces the wait. The stack of its own keeps that status from adding a gap to the
 * section's stack.
 */
function EmailField({ value, error, loading = false }: { value?: string; error?: string; loading?: boolean }) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <s-stack direction="block" gap="none">
      <s-email-field
        label={t("support.form.email")}
        name={loading ? undefined : "merchantEmail"}
        value={value}
        details={t("support.form.emailHelp")}
        error={error}
        disabled={loading}
      ></s-email-field>
      {loading ? <SkeletonStatus label={t("support.form.emailLoading")} /> : null}
    </s-stack>
  );
}

type ContactSectionProps = {
  defaultEmail: Promise<Outcome<string>>;
  messages: Messages;
  ccEmails: string[];
  onCcChange: (emails: string[]) => void;
};

function ContactSection({ defaultEmail, messages, ccEmails, onCcChange }: ContactSectionProps) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <s-section heading={t("support.form.emailHeading")}>
      <s-stack direction="block" gap="base">
        {/* Prefilled from Shopify — the merchant should never have to type their own address to get a reply. Clearable,
            because some merchants only want the in-app thread. */}
        <Deferred resolve={defaultEmail} pending={<EmailField loading />} failed={<EmailField error={messages.merchantEmail} />}>
          {(email) => <EmailField value={email} error={messages.merchantEmail} />}
        </Deferred>

        <s-divider direction="block" />

        <CcEmails
          id="new-ticket-cc"
          name="ccEmails"
          emails={ccEmails}
          onChange={onCcChange}
          labels={ccLabels(t, CC_MAX)}
          error={messages.ccEmails}
        />
      </s-stack>
    </s-section>
  );
}

/*
 * Sending a ticket is not saving a record, so it is an explicit primary action on the page (slot `primary-action`),
 * labelled "Send ticket", not the save bar's "Save" that appears only after an input changes. The button shows `loading`
 * while the ticket is on its way and is disabled while a file is still uploading: a ticket sent mid-upload would leave
 * the file behind. The form also refuses to submit in those states, so Enter in a text field cannot get round the button.
 */
export default function NewTicket() {
  const { defaultEmail, submissionKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const uploads = usePendingUploads();
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);

  const fieldErrors = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const messages = useFieldMessages(fieldErrors);
  const sending = navigation.state !== "idle" && navigation.formMethod === "POST";

  // Success is reported by the thread page we redirect to, so only failure is announced here. The inline banner below
  // stays the authoritative report.
  useActionToast(actionData, error ? { error: t(supportErrorKey(error)) } : undefined);

  return (
    <Form
      method="post"
      ref={form}
      onSubmit={(event) => {
        if (uploads.busy || sending) event.preventDefault();
      }}
    >
      {/* The language this page is drawn in, which the server stores on the ticket (see the action). */}
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <s-page heading={t("support.newTicket")}>
        <s-link slot="breadcrumb-actions" href="/app/support">
          {t("support.heading")}
        </s-link>
        <s-button
          slot="primary-action"
          variant="primary"
          loading={sending}
          disabled={uploads.busy}
          onClick={() => form.current?.requestSubmit()}
        >
          {t("support.form.submit")}
        </s-button>

        {error && (
          <s-section>
            <s-banner tone="critical" heading={t(supportErrorKey(error))}></s-banner>
          </s-section>
        )}

        <TicketDetailsSection messages={messages} uploads={uploads} />
        <ContactSection defaultEmail={defaultEmail} messages={messages} ccEmails={ccEmails} onCcChange={setCcEmails} />
      </s-page>
    </Form>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
