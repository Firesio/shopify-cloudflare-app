import { useRef, type ReactElement, type ReactNode } from "react";
import { SkeletonLines, SkeletonText } from "~/components/admin/Skeleton";
import { bodyLines } from "~/support/message-body";
import { fileExtensionLabel } from "~/support/attachment";
import { useElementEvent } from "~/admin/use-element-event";

/**
 * The conversation itself: one box per message, the merchant's own on a tinted background so "you" and "us"
 * read apart. Assembled from Polaris boxes, stacks, text, images and links; nothing here is hand-styled.
 *
 * The one raw element is `<video>`: Polaris has no video component, so it is left unstyled with native controls.
 */
export interface ThreadMessage {
  id: string;
  author: "merchant" | "staff";
  authorName: string;
  body: string;
  createdAt: number;
  /** Staff asked for an app review in this message: the box ends with a review link (when `reviewLink` is given). */
  asksReview: boolean;
  attachments: {
    id: string;
    filename: string;
    contentType: string;
    url: string;
    sizeBytes: number;
    kind: "image" | "video" | "file";
  }[];
}

type ThreadAttachment = ThreadMessage["attachments"][number];

type AttachmentRenderProps = {
  file: ThreadAttachment;
  formatFileSize: (sizeBytes: number) => string;
  /** Called when a file fails to load: its signed link may have expired. */
  onMediaError?: () => void;
};

/** Playable in place: making someone download a screen recording to see it defeats the point of attaching one. */
function VideoAttachment({ file, onMediaError }: AttachmentRenderProps) {
  return <video src={file.url} controls preload="metadata" width={320} onError={onMediaError} aria-label={file.filename} />;
}

function ImageAttachment({ file, onMediaError }: AttachmentRenderProps) {
  const image = useRef<HTMLElementTagNameMap["s-image"]>(null);
  // `error` is listened for on the element: see `useElementEvent`.
  useElementEvent(image, "error", () => onMediaError?.());
  return (
    <s-box maxInlineSize="320px">
      <s-clickable href={file.url} target="_blank" accessibilityLabel={file.filename} border="base" borderRadius="base">
        <s-image ref={image} src={file.url} alt={file.filename} loading="lazy" inlineSize="fill" aspectRatio="4/3" objectFit="contain"></s-image>
      </s-clickable>
    </s-box>
  );
}

function FileAttachment({ file, formatFileSize }: AttachmentRenderProps) {
  return (
    <s-stack direction="inline" gap="small" alignItems="center">
      <s-badge>{fileExtensionLabel(file.filename)}</s-badge>
      <s-stack direction="block" gap="small-500">
        <s-link href={file.url} download={file.filename}>
          {file.filename}
        </s-link>
        <s-text color="subdued">{formatFileSize(file.sizeBytes)}</s-text>
      </s-stack>
    </s-stack>
  );
}

/** Keyed by the closed kind union, so a new kind fails the build until it has a renderer. */
const ATTACHMENT_RENDERERS: Record<ThreadAttachment["kind"], (props: AttachmentRenderProps) => ReactElement> = {
  video: VideoAttachment,
  image: ImageAttachment,
  file: FileAttachment,
};

/** An app-review request: the neutral line, the button's label, and what pressing it does. */
export interface ReviewLink {
  readonly prompt: string;
  readonly label: string;
  readonly onRequest: () => void;
}

type ThreadProps = {
  /** The messages, or `"loading"` while the conversation is on its way: the same boxes, with skeletons in place of the words. */
  messages: readonly ThreadMessage[] | "loading";
  /** What to call the merchant's own messages — "You", translated. */
  youLabel: string;
  formatWhen: (at: number) => string;
  formatFileSize: (sizeBytes: number) => string;
  onMediaError?: () => void;
  /** What the review button says and does when pressed; without it (no App Store listing yet) no message shows one. */
  reviewLink?: ReviewLink;
};

function MessageAttachments({
  attachments,
  ...rest
}: Omit<AttachmentRenderProps, "file"> & { attachments: readonly ThreadAttachment[] }) {
  return (
    <s-stack direction="block" gap="small">
      {attachments.map((file) => {
        const Render = ATTACHMENT_RENDERERS[file.kind];
        return <Render key={file.id} file={file} {...rest} />;
      })}
    </s-stack>
  );
}

/** What a loading conversation shows: who spoke and how long it ran are guesses, since the real ones are not known yet. */
const LOADING_MESSAGES = [
  { key: "a", mine: true, lines: 2 },
  { key: "b", mine: false, lines: 3 },
  { key: "c", mine: true, lines: 1 },
] as const;

/** The one box every message sits in, loaded or loading, so the two cannot drift. */
function MessageFrame({ mine, who, when, children }: { mine: boolean; who: ReactNode; when: ReactNode; children: ReactNode }) {
  return (
    <s-box background={mine ? "subdued" : "base"} border="base" borderRadius="base" padding="base">
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" gap="small-300" alignItems="baseline">
          {who}
          {when}
        </s-stack>
        {children}
      </s-stack>
    </s-box>
  );
}

function MessageBox({
  message,
  youLabel,
  formatWhen,
  reviewLink,
  ...rest
}: Omit<ThreadProps, "messages"> & { message: ThreadMessage }) {
  const mine = message.author === "merchant";
  return (
    <MessageFrame
      mine={mine}
      who={<s-text type="strong">{mine ? youLabel : message.authorName}</s-text>}
      when={<s-text color="subdued">{formatWhen(message.createdAt)}</s-text>}
    >
      {bodyLines(message.body).map((line, index) => (
        <s-paragraph key={index}>{line}</s-paragraph>
      ))}

      {message.attachments.length > 0 && <MessageAttachments attachments={message.attachments} {...rest} />}

      {message.asksReview && message.author === "staff" && reviewLink && (
        <s-stack direction="block" gap="small" alignItems="start">
          <s-text color="subdued">{reviewLink.prompt}</s-text>
          <s-button icon="star" onClick={reviewLink.onRequest}>
            {reviewLink.label}
          </s-button>
        </s-stack>
      )}
    </MessageFrame>
  );
}

export function Thread({ messages, ...rest }: ThreadProps) {
  return (
    <s-stack direction="block" gap="base">
      {messages === "loading"
        ? LOADING_MESSAGES.map((placeholder) => (
            <MessageFrame
              key={placeholder.key}
              mine={placeholder.mine}
              who={<SkeletonText chars={placeholder.mine ? 3 : 8} type="strong" />}
              when={<SkeletonText chars={18} />}
            >
              <SkeletonLines lines={placeholder.lines} />
            </MessageFrame>
          ))
        : messages.map((message) => <MessageBox key={message.id} message={message} {...rest} />)}
    </s-stack>
  );
}
