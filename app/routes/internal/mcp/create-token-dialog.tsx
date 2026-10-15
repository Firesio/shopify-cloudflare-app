import { Form } from "react-router";
import { KeyRound } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { Checkbox } from "~/internal/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/internal/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/internal/components/ui/select";
import { MCP_SCOPES, SCOPE_DESCRIPTIONS } from "~/domain/mcp/scopes";

function ScopeCheckboxes() {
  return (
    <FieldSet>
      <FieldLegend variant="label">Permissions / scopes</FieldLegend>
      <FieldGroup className="max-h-48 gap-3 overflow-y-auto rounded-md border p-3">
        {MCP_SCOPES.map((scope) => {
          const desc = SCOPE_DESCRIPTIONS[scope];
          const id = `scope-${scope}`;
          return (
            <Field key={scope} orientation="horizontal">
              <Checkbox
                id={id}
                name="scopes"
                value={scope}
                defaultChecked={scope === "mcp:read" || scope === "mcp:tickets:write"}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>{desc?.label ?? scope}</FieldLabel>
                {desc?.description && <FieldDescription>{desc.description}</FieldDescription>}
              </FieldContent>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}

function CreateTokenForm({ setDialogOpen }: { setDialogOpen: (o: boolean) => void }) {
  return (
    <Form method="post" onSubmit={() => setDialogOpen(false)}>
      <input type="hidden" name="intent" value="create_pat" />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="label">Token label / purpose</FieldLabel>
          <Input id="label" name="label" placeholder="e.g. Claude Desktop on Mac" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="expires_in_days">Expiration</FieldLabel>
          <Select name="expires_in_days" defaultValue="30">
            <SelectTrigger id="expires_in_days" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
              <SelectItem value="never">Never expires</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <ScopeCheckboxes />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button type="submit">Create token</Button>
        </DialogFooter>
      </FieldGroup>
    </Form>
  );
}

export function CreateTokenDialog({
  dialogOpen,
  setDialogOpen,
}: {
  dialogOpen: boolean;
  setDialogOpen: (o: boolean) => void;
}) {
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRound />
          Generate new token
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate personal access token</DialogTitle>
          <DialogDescription>
            Create a scoped bearer token for AI agents or automated scripts. The token is shown once after creation.
          </DialogDescription>
        </DialogHeader>
        <CreateTokenForm setDialogOpen={setDialogOpen} />
      </DialogContent>
    </Dialog>
  );
}
