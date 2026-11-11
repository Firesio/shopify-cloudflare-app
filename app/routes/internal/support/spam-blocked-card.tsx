import { Form, useNavigation } from "react-router";
import { Ban, Undo2 } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "~/internal/components/ui/item";
import { Spinner } from "~/internal/components/ui/spinner";
import { formatDate } from "~/i18n/format";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { UTC } from "~/i18n/time-zone";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

export interface BlockedRowData {
  readonly pattern: string;
  readonly createdBy: string;
  readonly createdAt: number;
}

function useIsPending(intent: string, pattern?: string): boolean {
  const { state, formData } = useNavigation();
  if (state === "idle" || !formData) return false;
  return formData.get("intent") === intent && (pattern === undefined || formData.get("pattern") === pattern);
}

function BlockForm() {
  const pending = useIsPending("block_pattern");
  return (
    <Form method="post" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="intent" value="block_pattern" />
      <Field className="min-w-0 flex-1">
        <FieldLabel htmlFor="block-pattern" className="sr-only">
          Email address or domain to block
        </FieldLabel>
        <Input id="block-pattern" name="pattern" placeholder="spam.example or seo@spam.example" required maxLength={254} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Spinner /> : <Ban />}
        Block
      </Button>
    </Form>
  );
}

function BlockedRow({ entry }: { entry: BlockedRowData }) {
  const pending = useIsPending("unblock", entry.pattern);
  return (
    <Item variant="outline" size="sm" className="flex-wrap sm:flex-nowrap">
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full truncate">{entry.pattern}</ItemTitle>
        <ItemDescription className="truncate text-xs">
          {`Blocked by ${entry.createdBy} on ${formatDate(LANGUAGE, entry.createdAt, UTC)}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Form method="post">
          <input type="hidden" name="intent" value="unblock" />
          <input type="hidden" name="pattern" value={entry.pattern} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            {pending ? <Spinner /> : <Undo2 />}
            Unblock
          </Button>
        </Form>
      </ItemActions>
    </Item>
  );
}

/** A block covers an address, or a whole domain with its subdomains. Held mail is kept; only NEW mail is affected. */
export function BlockedSendersCard({ entries }: { readonly entries: readonly BlockedRowData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked senders</CardTitle>
        <CardDescription>
          Mail from an address or domain listed here is held without being checked. A domain covers its subdomains too.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Remounted when an entry is added, which is what empties the field after a block. */}
        <BlockForm key={entries.length} />
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one is blocked.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <BlockedRow key={entry.pattern} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
