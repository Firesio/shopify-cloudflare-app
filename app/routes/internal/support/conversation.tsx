import { FileText } from "lucide-react";
import { Avatar, AvatarFallback } from "~/internal/components/ui/avatar";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "~/internal/components/ui/item";
import { cn } from "~/internal/lib/utils";
import type { ThreadMessage } from "~/components/support/Thread";

type Attachment = ThreadMessage["attachments"][number];

interface ConversationProps {
  readonly messages: readonly ThreadMessage[];
  /** What to call the merchant's own messages (the staff view names the shop). */
  readonly merchantLabel: string;
  readonly formatWhen: (at: number) => string;
  readonly formatFileSize: (sizeBytes: number) => string;
}

/** Keyed by the closed kind union, so a new kind fails the build until it has a renderer. */
const ATTACHMENT_RENDERERS: Record<
  Attachment["kind"],
  (props: { readonly file: Attachment; readonly formatFileSize: (sizeBytes: number) => string }) => React.ReactElement
> = {
  video: ({ file }) => (
    <video className="max-w-sm rounded-md border" src={file.url} controls preload="metadata" />
  ),
  image: ({ file }) => (
    <a href={file.url} target="_blank" rel="noreferrer" className="block max-w-48 overflow-hidden rounded-md border">
      <img src={file.url} alt={file.filename} loading="lazy" className="block h-auto w-full" />
    </a>
  ),
  file: ({ file, formatFileSize }) => (
    <Item variant="outline" size="sm" asChild className="max-w-sm bg-background">
      <a href={file.url} download={file.filename}>
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="max-w-56 truncate">{file.filename}</ItemTitle>
          <ItemDescription>{formatFileSize(file.sizeBytes)}</ItemDescription>
        </ItemContent>
      </a>
    </Item>
  ),
};

function initials(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

function Message({
  message,
  merchantLabel,
  formatWhen,
  formatFileSize,
}: Omit<ConversationProps, "messages"> & { readonly message: ThreadMessage }) {
  const fromMerchant = message.author === "merchant";
  const who = fromMerchant ? merchantLabel : message.authorName;
  return (
    <li className="flex gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(who)}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-3",
          fromMerchant ? "bg-card" : "bg-muted/50",
        )}
      >
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{who}</span>
          <time>{formatWhen(message.createdAt)}</time>
        </div>
        {message.body && (
          <p className="text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">{message.body}</p>
        )}
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((file) => {
              const Render = ATTACHMENT_RENDERERS[file.kind];
              return <Render key={file.id} file={file} formatFileSize={formatFileSize} />;
            })}
          </div>
        )}
      </div>
    </li>
  );
}

export function Conversation({ messages, ...rest }: ConversationProps) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((message) => (
        <Message key={message.id} message={message} {...rest} />
      ))}
    </ol>
  );
}
