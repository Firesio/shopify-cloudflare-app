import { useEffect, useRef, useState } from "react";
import { Form } from "react-router";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { Textarea } from "~/internal/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/internal/components/ui/alert-dialog";
import { BODY_MAX } from "~/schemas/support";
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

/** Staff-only controls on a message our own team wrote: change its text, or remove it. */
function StaffMessageTools({ message, onEdit }: { readonly message: ThreadMessage; readonly onEdit: () => void }) {
  return (
    <div className="flex gap-1">
      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Edit message" onClick={onEdit}>
        <Pencil />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Delete message">
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the conversation with its files. The email the merchant already received cannot be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Form method="post">
              <input type="hidden" name="intent" value="delete_message" />
              <input type="hidden" name="messageId" value={message.id} />
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </Form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditMessageForm({ message, onDone }: { readonly message: ThreadMessage; readonly onDone: () => void }) {
  return (
    <Form method="post" className="flex flex-col gap-2" onSubmit={() => queueMicrotask(onDone)}>
      <input type="hidden" name="intent" value="edit_message" />
      <input type="hidden" name="messageId" value={message.id} />
      <Textarea name="body" rows={4} maxLength={BODY_MAX} defaultValue={message.body} required />
      <p className="text-xs text-muted-foreground">Editing changes what the thread shows. The merchant is not emailed again.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </Form>
  );
}

function Message({
  message,
  merchantLabel,
  formatWhen,
  formatFileSize,
}: Omit<ConversationProps, "messages"> & { readonly message: ThreadMessage }) {
  const fromMerchant = message.author === "merchant";
  const who = fromMerchant ? merchantLabel : message.authorName;
  const [editing, setEditing] = useState(false);
  return (
    <li className={cn("flex gap-3", !fromMerchant && "flex-row-reverse")}>
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(who)}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex min-w-0 max-w-[85%] flex-col gap-2 rounded-lg border p-3",
          fromMerchant ? "bg-card" : "border-primary/20 bg-primary/10",
        )}
      >
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{who}</span>
          <time>{formatWhen(message.createdAt)}</time>
          {!fromMerchant && !editing && (
            <span className="ms-auto">
              <StaffMessageTools message={message} onEdit={() => setEditing(true)} />
            </span>
          )}
        </div>
        {editing && <EditMessageForm message={message} onDone={() => setEditing(false)} />}
        {!editing && message.body && (
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

/** Scrolls inside its own box and opens on the newest message. */
export function Conversation({ messages, ...rest }: ConversationProps) {
  const box = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  return (
    <div ref={box} className="max-h-[60vh] overflow-y-auto pe-1">
      <ol className="flex flex-col gap-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} {...rest} />
        ))}
      </ol>
    </div>
  );
}
