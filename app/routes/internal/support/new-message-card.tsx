import { Sparkles } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "~/internal/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";
import { Textarea } from "~/internal/components/ui/textarea";
import { BODY_MAX } from "~/schemas/support";
import { InternalAttachmentPicker } from "~/components/support/InternalAttachmentPicker";
import type { usePendingUploads } from "~/routes/app/support/use-pending-uploads";
import type { useReplyDraft } from "~/internal/use-reply-draft";
import { REPLY_TONES, TONE_LABEL, toReplyTone } from "~/ai/tones";
import type { NewTicketForm } from "./new-form-state";

type ReplyDraft = ReturnType<typeof useReplyDraft>;

interface MessageCardProps {
  readonly form: NewTicketForm;
  readonly draft: ReplyDraft;
  readonly uploads: ReturnType<typeof usePendingUploads>;
  readonly isSubmitting: boolean;
}

function aiActionLabel(form: NewTicketForm): string {
  if (form.instruction.trim() !== "") return "Write message";
  return form.bodyText.trim() !== "" ? "Polish & optimize" : "Draft message";
}

function ToneSelect({ form }: { readonly form: NewTicketForm }) {
  return (
    <div className="flex items-center gap-2">
      <FieldLabel htmlFor="tone-select" className="text-muted-foreground">
        Tone
      </FieldLabel>
      <Select value={form.tone} onValueChange={(next) => form.setTone(toReplyTone(next))}>
        <SelectTrigger id="tone-select" size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPLY_TONES.map((option) => (
            <SelectItem key={option} value={option}>
              {TONE_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DraftButton({ form, draft, isSubmitting }: Omit<MessageCardProps, "uploads">) {
  const drafting = draft.state === "drafting";

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isSubmitting || drafting}
      onClick={() =>
        void draft.draft({
          ticketId: "new",
          shop: form.effectiveShop,
          subject: form.subject,
          category: form.category,
          tone: form.tone,
          instruction: form.instruction,
        })
      }
    >
      {drafting ? <Spinner /> : <Sparkles />}
      {drafting ? "Generating with AI…" : aiActionLabel(form)}
    </Button>
  );
}

function AssistantBox({ form, draft, isSubmitting }: Omit<MessageCardProps, "uploads">) {
  return (
    <Field className="rounded-lg border border-dashed bg-muted/40 p-4">
      <FieldLabel htmlFor="ai-instruction">
        <Sparkles className="size-4" />
        AI writing assistant
      </FieldLabel>
      <Textarea
        id="ai-instruction"
        rows={2}
        value={form.instruction}
        onChange={(e) => form.setInstruction(e.target.value)}
        placeholder="Tell the AI what to write (e.g. 'We investigated the checkout issue and deployed a fix, ask them to test')"
        disabled={draft.state === "drafting"}
        className="bg-background"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToneSelect form={form} />
        <DraftButton form={form} draft={draft} isSubmitting={isSubmitting} />
      </div>
      {draft.error && <FieldError>{draft.error}</FieldError>}
    </Field>
  );
}

function BodyField({ form }: { readonly form: NewTicketForm }) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="body">Message body</FieldLabel>
        <span className="text-xs text-muted-foreground tabular-nums">
          {form.bodyText.length}/{BODY_MAX}
        </span>
      </div>
      <Textarea
        id="body"
        name="body"
        rows={6}
        value={form.bodyText}
        onChange={(e) => form.setBodyText(e.target.value)}
        maxLength={BODY_MAX}
        placeholder="Write your message to the merchant, or use the AI assistant above..."
      />
      <FieldDescription>
        This message will be emailed to the merchant and visible in their embedded support portal.
      </FieldDescription>
    </Field>
  );
}

export function MessageCard({ form, draft, uploads, isSubmitting }: MessageCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Message and attachments</CardTitle>
        <CardDescription>Write your message or let the AI optimize and draft it.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <AssistantBox form={form} draft={draft} isSubmitting={isSubmitting} />
          <BodyField form={form} />
          <Field>
            <FieldTitle>Attachments</FieldTitle>
            <InternalAttachmentPicker uploads={uploads} />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
