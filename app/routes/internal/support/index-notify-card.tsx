import { useNavigation, useSubmit } from "react-router";
import { Card, CardContent } from "~/internal/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "~/internal/components/ui/field";
import { Switch } from "~/internal/components/ui/switch";

export function NotifyCard({ notifySupport }: { readonly notifySupport: boolean }) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const busy = navigation.state !== "idle";

  return (
    <Card>
      <CardContent>
        {/* One switch for the signed-in person's own preference, so it
            submits on change rather than needing a save button. */}
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="notify-support">Email me about tickets</FieldLabel>
            <FieldDescription>
              Send me an email when a merchant opens or replies to a ticket. Only active accounts are ever emailed.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="notify-support"
            defaultChecked={notifySupport}
            disabled={busy}
            onCheckedChange={(checked) => {
              void submit({ notifySupport: checked ? "on" : "off" }, { method: "post" });
            }}
          />
        </Field>
      </CardContent>
    </Card>
  );
}
