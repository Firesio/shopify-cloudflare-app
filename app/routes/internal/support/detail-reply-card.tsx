import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";
import { Textarea } from "~/internal/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { BODY_MAX } from "~/schemas/support";
import { InternalAttachmentPicker } from "~/components/support/InternalAttachmentPicker";
import { usePendingUploads } from "~/routes/app/support/use-pending-uploads";
import { useReplyDraft } from "~/internal/use-reply-draft";
import { DEFAULT_TONE, REPLY_TONES, TONE_LABEL, toReplyTone, type ReplyTone } from "~/ai/tones";

type ReplyDraft = ReturnType<typeof useReplyDraft>;

interface AiBoxProps {
  readonly ticketId: string;
  readonly draft: ReplyDraft;
  readonly busy: boolean;
}

/*
 * The label names the job, so nobody has to guess what pressing it will do to
 * text they have already written. Same three modes the prompt builder picks
 * between — read from the same two inputs, so they cannot disagree.
 */
function aiActionCopy(instruction: string): { label: string; hint: string } {
  if (instruction.trim() !== "") {
    return { label: "Write reply", hint: "Replaces the reply below" };
  }
  return {
    label: "Improve reply",
    hint: "Rewrites what is in the reply below, or suggests one if it is empty",
  };
}

function ToneSelect({ tone, onChange }: { readonly tone: ReplyTone; readonly onChange: (tone: ReplyTone) => void }) {
  return (
    <Select value={tone} onValueChange={(next) => onChange(toReplyTone(next))}>
      <SelectTrigger className="w-40" aria-label="Tone" size="sm">
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
  );
}

/**
 * The AI box is SEPARATE from the reply box on purpose. What goes here is
 * shorthand — "fix ships friday, say sorry" — and the reply is what comes back.
 * Typing notes into the field that gets emailed and hoping to remember to
 * overwrite them is how a note reaches a merchant.
 *
 * Empty, it falls back to the reply box: polish what is there, or suggest one
 * from the thread. The button says which.
 */
function AiBox({ ticketId, draft, busy }: AiBoxProps) {
  const [tone, setTone] = useState<ReplyTone>(DEFAULT_TONE);
  const [instruction, setInstruction] = useState("");
  const copy = aiActionCopy(instruction);

  return (
    <Field className="rounded-lg border border-dashed p-3">
      <FieldLabel htmlFor="ai-instruction">Tell the AI what to say</FieldLabel>
      <Textarea
        id="ai-instruction"
        rows={2}
        value={instruction}
        onChange={(event) => setInstruction(event.currentTarget.value)}
        placeholder="fix ships friday, apologise for the delay"
        disabled={draft.state === "drafting"}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ToneSelect tone={tone} onChange={setTone} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || draft.state === "drafting"}
          onClick={() => void draft.draft({ ticketId, tone, instruction })}
        >
          {draft.state === "drafting" ? <Spinner /> : <Sparkles />}
          {draft.state === "drafting" ? "Writing…" : copy.label}
        </Button>
      </div>
      <FieldDescription>{copy.hint}</FieldDescription>
    </Field>
  );
}

function ReplyActions({ isClosed, pendingIntent, busy }: { readonly isClosed: boolean; readonly pendingIntent: unknown; readonly busy: boolean }) {
  const closing = busy && pendingIntent === "close";
  const sending = busy && !closing;

  return (
    <Field orientation="horizontal">
      <Button type="submit" disabled={busy}>
        {sending && <Spinner />}
        {sending ? "Sending…" : "Send reply"}
      </Button>
      {!isClosed && (
        <Button type="submit" name="intent" value="close" variant="outline" disabled={busy}>
          {closing && <Spinner />}
          {closing ? "Closing…" : "Close ticket"}
        </Button>
      )}
    </Field>
  );
}

export function ReplyCard({ ticketId, isClosed }: { readonly ticketId: string; readonly isClosed: boolean }) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const pendingIntent = navigation.formData?.get("intent");
  // Targets the composer's textarea by id and rewrites what is in it.
  const draft = useReplyDraft("body");
  const uploads = usePendingUploads(ticketId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isClosed ? "Reopen with a reply" : "Reply"}</CardTitle>
        <CardDescription>This reply is emailed to the merchant and their copy list.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post">
          <FieldGroup>
            <AiBox ticketId={ticketId} draft={draft} busy={busy} />

            <Field>
              <FieldLabel htmlFor="body" className="sr-only">
                Reply
              </FieldLabel>
              <Textarea
                id="body"
                name="body"
                rows={5}
                maxLength={BODY_MAX}
                placeholder="Write your reply to the merchant…"
              />
            </Field>

            <InternalAttachmentPicker uploads={uploads} />

            {draft.error && <FieldError>{draft.error}</FieldError>}

            <ReplyActions isClosed={isClosed} pendingIntent={pendingIntent} busy={busy} />
          </FieldGroup>
        </Form>
      </CardContent>
    </Card>
  );
}
