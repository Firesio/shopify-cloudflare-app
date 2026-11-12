import { useEffect, useRef, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";
import { Switch } from "~/internal/components/ui/switch";
import { Textarea } from "~/internal/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { BODY_MAX } from "~/schemas/support";
import { InternalAttachmentPicker } from "~/internal/components/InternalAttachmentPicker";
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
    hint: "Rewrites what is in the reply below, or writes a generic holding reply if it is empty",
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
 * Empty, it falls back to the reply box: polish what is there, or write a generic holding reply
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

/**
 * Per send, not a setting: it starts off for the next one. On "Send reply" the merchant sees a review button under THIS
 * message; on "Close ticket" the closed-ticket banner carries it. Controlled, because a Radix switch is not reset by the
 * form's own reset. The whole text is the label, so clicking it toggles the switch. Shopify forbids asking for positive
 * reviews or offering anything for one: the merchant-facing wording is fixed and neutral, and there is no field to type it in.
 */
function AskReviewField({ checked, onChange }: { readonly checked: boolean; readonly onChange: (checked: boolean) => void }) {
  return (
    <Field orientation="horizontal">
      <Switch id="asks-review" name="asksReview" checked={checked} onCheckedChange={onChange} />
      <FieldLabel htmlFor="asks-review" className="flex-col items-start gap-0.5 font-normal">
        <span className="font-medium">Ask for an app review</span>
        <span className="text-sm text-muted-foreground">Adds a &quot;Review the app&quot; button to this reply, or to the closed-ticket banner when you close.</span>
      </FieldLabel>
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
  const formRef = useRef<HTMLFormElement>(null);
  const actionData = useActionData<{ success?: string }>();
  const { reset } = uploads;
  // Bumped on each sent reply; it is the AI box's key, so its note and tone start over.
  // Derived while rendering (a new action answer), not in an effect.
  const [sentCount, setSentCount] = useState(0);
  const [asksReview, setAsksReview] = useState(false);
  const [seenAnswer, setSeenAnswer] = useState(actionData);
  if (actionData !== seenAnswer) {
    setSeenAnswer(actionData);
    if (actionData?.success === "replied") setSentCount((count) => count + 1);
    // Whatever was just sent or closed has used the switch up.
    if (actionData?.success === "replied" || actionData?.success === "closed") setAsksReview(false);
  }
  // A sent reply empties the composer (text, attachments and the AI box).
  useEffect(() => {
    if (actionData?.success === "replied") {
      formRef.current?.reset();
      reset();
    }
  }, [actionData, reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isClosed ? "Reopen with a reply" : "Reply"}</CardTitle>
        <CardDescription>This reply is emailed to the merchant and their copy list.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" ref={formRef}>
          <FieldGroup>
            <AiBox key={sentCount} ticketId={ticketId} draft={draft} busy={busy} />

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

            <AskReviewField checked={asksReview} onChange={setAsksReview} />

            {draft.error && <FieldError>{draft.error}</FieldError>}

            <ReplyActions isClosed={isClosed} pendingIntent={pendingIntent} busy={busy} />
          </FieldGroup>
        </Form>
      </CardContent>
    </Card>
  );
}
