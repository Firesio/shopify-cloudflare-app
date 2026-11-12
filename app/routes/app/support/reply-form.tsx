import { useEffect, useRef } from "react";
import { Form } from "react-router";
import { useTranslation } from "react-i18next";

import { AttachmentPicker } from "~/components/support/AttachmentPicker";
import { pickerLabels } from "~/components/support/picker-labels";
import { useLanguage } from "~/i18n/useLanguage";
import type { ReviewLink } from "~/components/support/Thread";
import { BODY_MAX } from "~/schemas/support";
import { usePendingUploads } from "./use-pending-uploads";

export type ReplyFormProps = {
  ticketId: string;
  /** A closed ticket still takes a reply: it reopens the ticket. The form says so. */
  closed: boolean;
  /** Present when staff asked for an app review as they closed the ticket: the closed-ticket banner carries the button. */
  closedReview?: ReviewLink | undefined;
  /** Identifies THIS message: sending it twice (a double click, a retry) stores it once. */
  submissionKey: string;
  sending: boolean;
  /** The action's last error, so a dead attachment list can be cleared. */
  error: string | undefined;
  /** The action result of a reply that was stored (a new object per completed send), or undefined. */
  replied: object | undefined;
  /**
   * The ticket is still loading. The composer is the same markup, held still: nothing can be typed or sent into a thread
   * whose status (a closed one says replying reopens it) is not known yet, and the page swaps this for the live form.
   */
  loading?: boolean;
};

/**
 * The reply composer.
 *
 * The page mounts it with `key` = the number of messages, so a stored reply gives a fresh form (empty text, no staged
 * files, a new submission key) and a failed one keeps everything the merchant typed.
 *
 * Verified by hand only: Polaris custom elements.
 */
export function ReplyForm({ ticketId, closed, closedReview, submissionKey, sending, error, replied, loading = false }: ReplyFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const uploads = usePendingUploads(ticketId);
  const { labels, formatSize } = pickerLabels(t, language);
  const blocked = uploads.busy || sending || loading;
  const body = useRef<HTMLElementTagNameMap["s-text-area"]>(null);

  // The staged files the server refused are gone for good (expired or already used): drop them so the merchant adds
  // them again instead of resubmitting ids that can never be adopted.
  const { reset } = uploads;
  useEffect(() => {
    if (error === "invalid_upload") reset();
  }, [error, reset]);

  // A stored reply empties the form even when the page has not yet remounted it (the thread reloads a moment later), so the
  // next reply cannot resubmit the ids the last one used up (`invalid_upload`).
  useEffect(() => {
    if (!replied) return;
    reset();
    if (body.current) body.current.value = "";
  }, [replied, reset]);

  return (
    <Form
      method="post"
      replace
      onSubmit={(event) => {
        if (blocked) event.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="reply" />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <s-stack direction="block" gap="base">
        {closed && (
          <s-banner tone="info" heading={t("support.thread.closedNotice")}>
            {closedReview && (
              <>
                <s-paragraph>{closedReview.prompt}</s-paragraph>
                <s-button slot="secondary-actions" icon="star" onClick={closedReview.onRequest}>
                  {closedReview.label}
                </s-button>
              </>
            )}
          </s-banner>
        )}

        <s-text-area
          ref={body}
          label={t("support.thread.reply")}
          labelAccessibilityVisibility="exclusive"
          name="body"
          placeholder={t("support.thread.replyPlaceholder")}
          rows={4}
          maxLength={BODY_MAX}
          disabled={loading}
        ></s-text-area>

        <AttachmentPicker uploads={uploads} labels={labels} formatSize={formatSize} disabled={loading} />

        {/* Sending a message is not saving a record, so this one stays a button in the form rather than moving to the save bar. */}
        <s-stack direction="inline">
          <s-button type="submit" variant="primary" loading={sending} disabled={uploads.busy || loading}>
            {sending ? t("support.thread.sending") : closed ? t("support.thread.sendAndReopen") : t("support.thread.send")}
          </s-button>
        </s-stack>
      </s-stack>
    </Form>
  );
}
