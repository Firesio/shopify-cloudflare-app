import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData, useNavigation, useParams, useSearchParams, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { getEnv } from "~/request-context.server";
import { appReviewUrl } from "~/lib/install-target";
import { guardMember } from "~/admin/require-member.server";
import { settle } from "~/admin/settle.server";
import { useActionToast } from "~/admin/use-action-toast";
import { Deferred, FailedSection } from "~/components/admin/Deferred";
import { supportErrorKey } from "~/support/error-keys";
import { sameCcList } from "~/support/cc-list";
import { readAttachmentLinks, readThread, runThreadAction } from "./detail.server";
import { CcSaveBar, ConversationSection, DetailsAside, ErrorBanner, ReplySection, useCcSaveBarVisibility } from "./thread-parts";
import { useFreshLinks } from "./use-fresh-links";

export const handle = { i18n: ["common", "admin"] };

/** The `?links=1` variant: the same loader, asked only for freshly signed attachment links (see `useFreshLinks`). */
function wantsLinksOnly(request: Request): boolean {
  return new URL(request.url).searchParams.get("links") === "1";
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  // Authentication is awaited; the thread streams so the frame renders at once.
  const { session } = await guardMember(request, "app:view");
  const ticketId = params.ticketId ?? "";

  if (wantsLinksOnly(request)) {
    const links = await settle(readAttachmentLinks(session.shop, ticketId), {
      event: "admin.support.links.failed",
      shop: session.shop,
      route: "app/support/detail",
    });
    return { links: links.ok ? links.value : [] };
  }

  return {
    thread: settle(readThread(session.shop, ticketId), {
      event: "admin.support.thread.failed",
      shop: session.shop,
      route: "app/support/detail",
    }),
    // Identifies the next reply sent from this load: sending it twice stores it once. A new load, a new key.
    replyKey: crypto.randomUUID(),
    // Null until the app has a listing (`SHOPIFY_APP_HANDLE`): a message that asks for a review then shows nothing.
    reviewUrl: appReviewUrl(getEnv().SHOPIFY_APP_HANDLE),
  };
};

/**
 * Command dispatch on `intent` lives in `./detail.server` — the action stays a thin parse, call and respond.
 *
 * There is deliberately no `close` intent. Closing is a support decision, not a
 * merchant one: a merchant either stops replying or says it is fixed, and
 * asking them to file the ticket AND tidy it up afterwards is our housekeeping
 * on their screen. Staff close threads from the internal console.
 */
export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { session } = await guardMember(request, "app:view");
  const outcome = await runThreadAction({ shop: session.shop, ticketId: params.ticketId ?? "", form: await request.formData() });
  return outcome.ok ? data({ success: outcome.success }) : data({ error: outcome.error }, { status: outcome.status });
};

type ThreadData = NonNullable<Awaited<ReturnType<typeof readThread>>>;

function LoadedThread({ ticket, messages, replyKey, reviewUrl }: ThreadData & { replyKey: string; reviewUrl: string | null }) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { t } = useTranslation(["admin", "common"]);
  const submit = useSubmit();
  const ccForm = useRef<HTMLFormElement>(null);
  const [ccEmails, setCcEmails] = useState<string[]>([...ticket.ccEmails]);
  const fresh = useFreshLinks(ticket.id, messages);

  const busy = navigation.state !== "idle";
  const pendingIntent = navigation.formData?.get("intent");
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  const success = actionData && "success" in actionData ? actionData.success : undefined;

  useCcSaveBarVisibility(!sameCcList(ccEmails, ticket.ccEmails));

  useActionToast(actionData, {
    error: error ? t(supportErrorKey(error)) : undefined,
    success: success ? t(`support.success.${success}`) : undefined,
  });

  return (
    <>
      <CcSaveBar
        saving={busy && pendingIntent === "cc"}
        onSave={() => {
          const form = ccForm.current;
          if (form) void submit(form);
        }}
        onDiscard={() => setCcEmails([...ticket.ccEmails])}
      />

      <s-page heading={ticket.subject}>
        <s-link slot="breadcrumb-actions" href="/app/support">
          {t("support.heading")}
        </s-link>

        <ErrorBanner error={error} />

        <ConversationSection messages={fresh.messages} onMediaError={fresh.onMediaError} reviewUrl={reviewUrl} />
        {/* Keyed by the message count: a stored reply gives a fresh form (empty text, no staged files, a new key), while a
            failed one and a copy-list save keep everything typed. */}
        <ReplySection
          key={messages.length}
          ticketId={ticket.id}
          closed={ticket.status === "closed"}
          submissionKey={replyKey}
          sending={busy && pendingIntent === "reply"}
          error={error}
          replied={success === "replied" ? actionData : undefined}
        />
        <DetailsAside ticket={ticket} ccEmails={ccEmails} onCcChange={setCcEmails} ccForm={ccForm} />
      </s-page>
    </>
  );
}

/** The page frame, known before any data: a generic heading (the subject replaces it) and the way back. */
function ThreadFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <s-page heading={t("support.thread.pageHeading")}>
      <s-link slot="breadcrumb-actions" href="/app/support">
        {t("support.heading")}
      </s-link>
      {children}
    </s-page>
  );
}

/**
 * The whole page while the thread streams, from the SAME parts as the loaded one: the conversation box with message-shaped
 * skeletons, the composer held still, the details column with skeleton values. Nothing is a look-alike written twice.
 */
function PendingThread({ replyKey }: { replyKey: string }) {
  const { ticketId = "" } = useParams();
  return (
    <ThreadFrame>
      <ConversationSection messages="loading" />
      <ReplySection ticketId={ticketId} closed={false} submissionKey={replyKey} sending={false} error={undefined} replied={undefined} loading />
      <DetailsAside ticket="loading" />
    </ThreadFrame>
  );
}

export default function SupportThreadPage() {
  const loaded = useLoaderData<typeof loader>();
  const { t } = useTranslation(["admin", "common"]);
  const loadFailed = (
    <ThreadFrame>
      <FailedSection heading={t("support.loadFailedHeading")} body={t("support.loadFailedBody")} />
    </ThreadFrame>
  );

  // Independent of the thread, so it fires on arrival rather than after the data.
  useCreatedToast();

  // The links-only answer is for the fetcher; this page never renders it.
  const { thread: streamed, replyKey, reviewUrl } = loaded;
  if (streamed === undefined || replyKey === undefined || reviewUrl === undefined) return loadFailed;

  return (
    <Deferred
      resolve={streamed}
      pending={<PendingThread replyKey={replyKey} />}
      failed={loadFailed}
    >
      {(thread) =>
        thread ? (
          <LoadedThread ticket={thread.ticket} messages={thread.messages} replyKey={replyKey} reviewUrl={reviewUrl} />
        ) : (
          <ThreadFrame>
            <FailedSection heading={t("support.thread.notFoundHeading")} body={t("support.thread.notFoundBody")} />
          </ThreadFrame>
        )
      }
    </Deferred>
  );
}

/**
 * Confirms the ticket the merchant just filed, on the page they land on.
 *
 * The flag is stripped from the URL immediately so a refresh — or the back
 * button — does not congratulate them a second time for something they did
 * once.
 */
function useCreatedToast() {
  const { t } = useTranslation(["admin", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const created = searchParams.get("created") === "1";

  useEffect(() => {
    if (!created) return;
    globalThis.shopify.toast.show(t("support.success.created"));
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("created");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [created, t, setSearchParams]);
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
