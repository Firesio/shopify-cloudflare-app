import { Form } from "react-router";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/internal/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/internal/components/ui/empty";
import { Field, FieldLabel } from "~/internal/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "~/internal/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";
import {
  ArrowDown,
  ArrowUp,
  Cpu,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { ChainButton, useIsPending } from "./chain-button";
import type { Purpose } from "./purposes";

type ChainEntry = Purpose["chain"][number];

function PurposeHeader({ purpose }: { purpose: Purpose }) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Cpu className="size-4 text-muted-foreground" />
        {purpose.label}
      </CardTitle>
      <CardDescription>{purpose.description} Models are tried in the order listed.</CardDescription>
      <CardAction className="flex flex-wrap justify-end gap-1.5">
        {purpose.usedBy ? (
          <Badge variant="outline">{purpose.usedBy}</Badge>
        ) : (
          <Badge variant="secondary">Not used yet</Badge>
        )}
        {purpose.chain.length === 0 && <Badge variant="outline">Off</Badge>}
      </CardAction>
    </CardHeader>
  );
}

function EmptyChain({ role, busy }: { role: string; busy: boolean }) {
  const pending = useIsPending(role, "recommend");
  return (
    <Empty className="border border-dashed p-6">
      <EmptyHeader>
        <EmptyTitle>No models yet</EmptyTitle>
        <EmptyDescription>This purpose is switched off.</EmptyDescription>
      </EmptyHeader>
      <Form method="post">
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="intent" value="recommend" />
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          {pending ? <Spinner /> : <Wand2 />}
          Use recommended
        </Button>
      </Form>
    </Empty>
  );
}

function ChainEntryRow({
  role,
  entry,
  index,
  isLast,
  busy,
}: {
  role: string;
  entry: ChainEntry;
  index: number;
  isLast: boolean;
  busy: boolean;
}) {
  return (
    <Item variant="outline" size="sm" className="flex-wrap sm:flex-nowrap">
      <span className="w-5 text-sm tabular-nums text-muted-foreground">{index + 1}</span>
      <ItemContent className="min-w-0 basis-[calc(100%-2.5rem)] sm:basis-auto">
        <ItemTitle className="max-w-full truncate">{entry.label}</ItemTitle>
        <ItemDescription className="truncate text-xs">{entry.modelId}</ItemDescription>
      </ItemContent>
      <ItemActions className="w-full flex-wrap justify-end gap-1 sm:w-auto">
        {!entry.enabled && <Badge variant="secondary">Paused</Badge>}
        {/* Set by the RUNTIME after a failure, and it clears itself. */}
        {entry.demoted && <Badge variant="destructive">Recently failed</Badge>}
        {entry.retired && <Badge variant="destructive">Not in catalogue</Badge>}
        <ChainButton
          role={role}
          modelId={entry.modelId}
          intent="up"
          label="Move up"
          busy={busy}
          disabled={index === 0}
        >
          <ArrowUp />
        </ChainButton>
        <ChainButton
          role={role}
          modelId={entry.modelId}
          intent="down"
          label="Move down"
          busy={busy}
          disabled={isLast}
        >
          <ArrowDown />
        </ChainButton>
        <ChainButton
          role={role}
          modelId={entry.modelId}
          intent={entry.enabled ? "disable" : "enable"}
          label={entry.enabled ? "Pause model" : "Resume model"}
          busy={busy}
        >
          {entry.enabled ? <PauseCircle /> : <PlayCircle />}
        </ChainButton>
        <ChainButton
          role={role}
          modelId={entry.modelId}
          intent="remove"
          label="Remove from chain"
          busy={busy}
        >
          <Trash2 />
        </ChainButton>
      </ItemActions>
    </Item>
  );
}

/**
 * The select is ordered FOR THIS PURPOSE — best first — so the default choice
 * is already the right one and nobody has to compare 21 model names.
 */
function AddModelForm({ purpose, busy }: { purpose: Purpose; busy: boolean }) {
  const pending = useIsPending(purpose.role, "add");
  const selectId = `add-model-${purpose.role}`;
  return (
    <Form method="post" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="role" value={purpose.role} />
      <input type="hidden" name="intent" value="add" />
      <Field className="min-w-0 flex-1">
        <FieldLabel htmlFor={selectId} className="sr-only">
          Add a model to {purpose.label}
        </FieldLabel>
        <Select name="modelId" defaultValue={purpose.available[0]?.id}>
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue placeholder="Choose a model…" />
          </SelectTrigger>
          <SelectContent>
            {purpose.available.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label} — {model.note}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" variant="outline" disabled={busy}>
        {pending ? <Spinner /> : <Plus />}
        Add to chain
      </Button>
    </Form>
  );
}

/**
 * One card per PURPOSE, each holding an ORDERED chain. The first model that
 * answers wins; a model that errors is tried past and demoted, so one flaky
 * model costs a retry rather than the feature.
 */
export function PurposeCard({ purpose, busy }: { purpose: Purpose; busy: boolean }) {
  return (
    <Card>
      <PurposeHeader purpose={purpose} />
      <CardContent className="flex flex-col gap-3">
        {purpose.chain.length === 0 ? (
          <EmptyChain role={purpose.role} busy={busy} />
        ) : (
          <div className="flex flex-col gap-2">
            {purpose.chain.map((entry, index) => (
              <ChainEntryRow
                key={entry.modelId}
                role={purpose.role}
                entry={entry}
                index={index}
                isLast={index === purpose.chain.length - 1}
                busy={busy}
              />
            ))}
          </div>
        )}
        {purpose.available.length > 0 && <AddModelForm purpose={purpose} busy={busy} />}
      </CardContent>
    </Card>
  );
}
