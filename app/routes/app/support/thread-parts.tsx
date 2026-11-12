import { useEffect, type ReactNode, type RefObject } from "react";
import { Form } from "react-router";
import { useTranslation } from "react-i18next";

import { SkeletonBadge, SkeletonStatus, SkeletonText } from "~/components/admin/Skeleton";
import { CcEmails, ccLabels } from "~/components/support/CcEmails";
import { Thread, type ThreadMessage } from "~/components/support/Thread";
import { formatDate, formatDateTime } from "~/i18n/format";
import { useLanguage } from "~/i18n/useLanguage";
import { useTimeZone } from "~/i18n/useTimeZone";
import { CATEGORY_LABEL_KEY, type SupportCategory } from "~/support/categories";
import { CC_MAX } from "~/support/cc-list";
import { formatFileSize } from "~/support/file-size";
import { supportErrorKey } from "~/support/error-keys";
import { STATUS_TONE, type SupportStatus } from "~/support/status";
import { ReplyForm, type ReplyFormProps } from "./reply-form";

export type TicketView = {
  readonly id: string;
  readonly subject: string;
  readonly category: SupportCategory;
  readonly status: SupportStatus;
  readonly createdAt: number;
  readonly ccEmails: readonly string[];
};

const CC_SAVE_BAR_ID = "thread-cc-save-bar";

type CcSaveBarProps = {
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
};

/*
 * Driven by whether the list actually changed, not by whether the
 * merchant touched the control: the CC list lives in React state, so
 * `data-save-bar`'s automatic dirty tracking — which watches DOM input
 * events — would never see it. `sameCcList` is order- and case-blind, so
 * removing an address and adding it straight back correctly counts as no
 * change.
 */
export function CcSaveBar({ saving, onSave, onDiscard }: CcSaveBarProps) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <ui-save-bar id={CC_SAVE_BAR_ID} discardConfirmation>
      {/* `""` is the HTML boolean-attribute form, and `undefined` omits the
          attribute — `loading={false}` would render `loading="false"`, which
          the element reads as present. */}
      <button variant="primary" loading={saving ? "" : undefined} onClick={onSave}>
        {t("common:actions.save")}
      </button>
      <button onClick={onDiscard}>{t("common:actions.discard")}</button>
    </ui-save-bar>
  );
}

/**
 * Shows the save bar only while the CC list differs from what is stored, and takes it away when the page goes: a bar left
 * showing would follow the merchant to the next screen with a Save button that saves nothing.
 */
export function useCcSaveBarVisibility(dirty: boolean) {
  useEffect(() => {
    const bar = globalThis.shopify.saveBar;
    const update = dirty ? bar.show?.(CC_SAVE_BAR_ID) : bar.hide?.(CC_SAVE_BAR_ID);
    void update;
  }, [dirty]);

  useEffect(
    () => () => {
      void globalThis.shopify.saveBar.hide?.(CC_SAVE_BAR_ID);
    },
    [],
  );
}

type ConversationSectionProps = {
  /** The messages, or `"loading"`: the same section and boxes, with skeletons in place of the words. */
  messages: readonly ThreadMessage[] | "loading";
  onMediaError?: () => void;
  /** The App Store review link, or null/absent while the app has no listing: then no message shows a review prompt. */
  reviewUrl?: string | null;
};

/** Carries the page's ONE loading announcement: the other sections that wait on the same thread stay silent. */
export function ConversationSection({ messages, onMediaError, reviewUrl }: ConversationSectionProps) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const timeZone = useTimeZone();
  return (
    <s-section heading={t("support.thread.conversation")}>
      <Thread
        messages={messages}
        youLabel={t("support.thread.you")}
        formatFileSize={(sizeBytes) => formatFileSize(language, sizeBytes)}
        formatWhen={(at) => formatDateTime(language, at, timeZone)}
        onMediaError={onMediaError}
        reviewLink={reviewUrl ? { url: reviewUrl, prompt: t("support.thread.reviewPrompt"), label: t("support.thread.reviewAction") } : undefined}
      />
      {messages === "loading" ? <SkeletonStatus label={t("support.thread.loading")} /> : null}
    </s-section>
  );
}

/** The reply composer in its section. While the ticket loads it is the same form, held still (see `ReplyForm`). */
export function ReplySection(props: ReplyFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <s-section heading={t("support.thread.reply")}>
      <ReplyForm {...props} />
    </s-section>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <s-stack direction="block" gap="small-300">
      <s-text color="subdued">{label}</s-text>
      {children}
    </s-stack>
  );
}

type DetailsAsideProps =
  | { ticket: "loading" }
  | {
      ticket: TicketView;
      ccEmails: string[];
      onCcChange: (emails: string[]) => void;
      ccForm: RefObject<HTMLFormElement | null>;
    };

const ignoreChange = () => undefined;

/** The details column. `ticket: "loading"` keeps every label, the Add button and the form; only the values are skeletons. */
export function DetailsAside(props: DetailsAsideProps) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const timeZone = useTimeZone();
  const loaded = props.ticket === "loading" ? undefined : props;
  return (
    <s-box slot="aside">
      <s-section heading={t("support.thread.details")}>
        <s-stack direction="block" gap="base">
          <DetailField label={t("support.columns.status")}>
            {loaded ? (
              <s-badge tone={STATUS_TONE[loaded.ticket.status]}>{t(`support.status.${loaded.ticket.status}`)}</s-badge>
            ) : (
              <SkeletonBadge chars={12} />
            )}
          </DetailField>

          <DetailField label={t("support.columns.category")}>
            {loaded ? <s-text>{t(CATEGORY_LABEL_KEY[loaded.ticket.category])}</s-text> : <SkeletonText chars={16} />}
          </DetailField>

          <DetailField label={t("support.thread.created")}>
            {loaded ? <s-text>{formatDate(language, loaded.ticket.createdAt, timeZone)}</s-text> : <SkeletonText chars={12} />}
          </DetailField>

          <s-divider direction="block" />

          {/* Editable after the fact: who needs to see a thread changes as it goes on, and re-opening a ticket to add a
              colleague is worse. No Save button of its own: unsaved changes belong in the admin's save bar, which exists
              only while there is something to save. The form stays because it is what carries the value; the bar submits it. */}
          <Form method="post" replace ref={loaded?.ccForm}>
            <input type="hidden" name="intent" value="cc" />
            <CcEmails
              id="thread-cc"
              name="ccEmails"
              emails={loaded ? loaded.ccEmails : "loading"}
              onChange={loaded ? loaded.onCcChange : ignoreChange}
              labels={ccLabels(t, CC_MAX)}
            />
          </Form>
        </s-stack>
      </s-section>
    </s-box>
  );
}

export function ErrorBanner({ error }: { error: string | undefined }) {
  const { t } = useTranslation(["admin", "common"]);
  if (!error) return null;
  return (
    <s-section>
      <s-banner tone="critical" heading={t(supportErrorKey(error))}></s-banner>
    </s-section>
  );
}
