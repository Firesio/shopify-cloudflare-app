import { useState } from "react";
import { Card, CardContent } from "~/internal/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { Textarea } from "~/internal/components/ui/textarea";
import { cn } from "~/internal/lib/utils";
import { CONTENT_LIMITS, type ContentField } from "~/domain/campaign";
import { formatNumber } from "~/i18n/format";
import { faultText, type FieldErrors } from "./outcomes";
import { StepHeader } from "./step";

interface TextFieldProps {
  readonly field: ContentField;
  readonly label: string;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly defaultValue: string;
  readonly errors: FieldErrors;
  readonly multiline?: boolean;
}

/** A field with its character count against the limit the server enforces, and the server's complaint under it. */
function TextField({ field, label, hint, placeholder, defaultValue, errors, multiline = false }: TextFieldProps) {
  const [length, setLength] = useState(defaultValue.length);
  const limit = CONTENT_LIMITS[field];
  const fault = errors[field];
  const id = `campaign-${field}`;
  const shared = {
    id,
    name: field,
    defaultValue,
    placeholder,
    "aria-invalid": fault !== undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLength(event.currentTarget.value.length),
  };
  return (
    <Field data-invalid={fault !== undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className={cn("text-xs tabular-nums", length > limit ? "text-destructive" : "text-muted-foreground")}>
          {`${formatNumber("en", length)} / ${formatNumber("en", limit)}`}
        </span>
      </div>
      {multiline ? <Textarea rows={10} className="min-h-48" {...shared} /> : <Input {...shared} />}
      {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
      {fault !== undefined && <FieldError>{faultText(field, fault)}</FieldError>}
    </Field>
  );
}

export interface WrittenContent {
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
}

/** Step 1: the words. Plain text: what is written is what is sent. */
export function WriteStep({ content, errors }: { readonly content: WrittenContent; readonly errors: FieldErrors }) {
  return (
    <Card>
      <StepHeader number={1} title="Write it" description="What merchants will read. You can send yourself a test before it goes to anyone." />
      <CardContent>
        <FieldGroup>
          <TextField field="name" label="Name" hint="Only your team sees this, in the list of campaigns." placeholder="Big update, November" defaultValue={content.name} errors={errors} />
          <TextField field="subject" label="Subject" hint="The email's subject line." placeholder="A big update is coming next week" defaultValue={content.subject} errors={errors} />
          <TextField
            field="body"
            label="Message"
            hint="Plain text. Leave a blank line between paragraphs."
            defaultValue={content.body}
            errors={errors}
            multiline
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField field="ctaLabel" label="Button label (optional)" placeholder="See what is new" defaultValue={content.ctaLabel} errors={errors} />
            <TextField field="ctaUrl" label="Button link (optional)" placeholder="https://" defaultValue={content.ctaUrl} errors={errors} />
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
