import { useState } from "react";
import { useFetcher } from "react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent } from "~/internal/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { RadioGroup, RadioGroupItem } from "~/internal/components/ui/radio-group";
import { Spinner } from "~/internal/components/ui/spinner";
import { AUDIENCE_KINDS, type AudienceFilter, type AudienceKind, type AudiencePreview } from "~/domain/campaign-audience";
import { instantToDay } from "~/schemas/campaign";
import type { CampaignActionResult } from "./outcomes";
import { PreviewCard } from "./audience-preview";
import { StepHeader } from "./step";

const KIND_COPY: Readonly<Record<AudienceKind, { readonly title: string; readonly description: string }>> = {
  real: { title: "Real stores", description: "Development stores are left out. This is the usual choice." },
  dev: { title: "Development stores", description: "Only test stores. Good for trying an announcement out." },
  all: { title: "Real and development stores", description: "Everyone who has the app installed." },
};

function isKind(value: string): value is AudienceKind {
  return AUDIENCE_KINDS.some((kind) => kind === value);
}

/**
 * Step 2: who gets it. The count beside it is asked of the server with the values as they are in the form right now
 * ("Refresh count"), so a person sees the effect of a choice before saving it.
 */
export function AudienceStep({ audience, savedPreview, saved }: { readonly audience: AudienceFilter; readonly savedPreview: AudiencePreview; readonly saved: boolean }) {
  const [kind, setKind] = useState<AudienceKind>(audience.kind);
  const [stale, setStale] = useState(false);
  const fetcher = useFetcher<CampaignActionResult>();
  const counted = fetcher.data?.kind === "preview" ? fetcher.data.preview : undefined;

  const refresh = (form: HTMLFormElement | null) => {
    if (form === null) return;
    const values = new FormData(form);
    values.set("intent", "preview");
    setStale(false);
    void fetcher.submit(values, { method: "post" });
  };

  return (
    <Card>
      <StepHeader number={2} title="Choose who gets it" description="Only shops where the app is still installed, with an email address, that have not unsubscribed." />
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">Which shops</FieldLegend>
            <input type="hidden" name="audienceKind" value={kind} />
            <RadioGroup
              value={kind}
              aria-label="Which shops"
              onValueChange={(value) => {
                if (isKind(value)) {
                  setKind(value);
                  setStale(true);
                }
              }}
            >
              {AUDIENCE_KINDS.map((option) => (
                <FieldLabel key={option} htmlFor={`audience-${option}`}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{KIND_COPY[option].title}</FieldTitle>
                      <FieldDescription>{KIND_COPY[option].description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={option} id={`audience-${option}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">When the app was installed (optional)</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="audience-installed-after">On or after</FieldLabel>
                <Input id="audience-installed-after" type="date" name="installedAfter" defaultValue={instantToDay(audience.installedAfter)} onChange={() => setStale(true)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="audience-installed-before">Before</FieldLabel>
                <Input id="audience-installed-before" type="date" name="installedBefore" defaultValue={instantToDay(audience.installedBefore)} onChange={() => setStale(true)} />
              </Field>
            </div>
            <FieldDescription>Leave a date empty for no limit. Dates are in UTC.</FieldDescription>
          </FieldSet>

          <PreviewCard
            label="Who would receive it: your choices"
            preview={counted ?? savedPreview}
            caption={previewCaption({ stale, refreshed: counted !== undefined, saved })}
            action={
              <Button type="button" variant="outline" size="sm" disabled={fetcher.state !== "idle"} onClick={(event) => refresh(event.currentTarget.form)}>
                {fetcher.state !== "idle" ? <Spinner /> : <RefreshCw />}
                Refresh count
              </Button>
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function previewCaption({ stale, refreshed, saved }: { readonly stale: boolean; readonly refreshed: boolean; readonly saved: boolean }): string {
  if (stale) return "You changed the audience. Refresh the count to see who it reaches now.";
  if (refreshed) return "Counted just now for the choices above.";
  return saved ? "Counted for the audience as saved." : "Counted for the default audience.";
}
