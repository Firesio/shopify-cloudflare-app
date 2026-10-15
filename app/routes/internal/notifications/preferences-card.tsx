import { useFetcher } from "react-router";
import type { NotificationActionResult, NotificationSettingsView } from "~/domain/staff-notification-view";
import { STAFF_CHANNELS, type StaffChannel, type StaffMatrixRow } from "~/domain/staff-notification-topics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Label } from "~/internal/components/ui/label";
import { Separator } from "~/internal/components/ui/separator";
import { Spinner } from "~/internal/components/ui/spinner";
import { Switch } from "~/internal/components/ui/switch";
import { useActionToast } from "~/internal/use-action-toast";
import { CHANNEL_LABEL, describeResult, groupMatrix } from "./messages";

const NOTIFICATIONS_ACTION = "/internal/notifications";

/** md and up: one grid for the column headings and every row, so the switches line up. */
const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_5rem_5rem] md:items-center md:gap-4";

/**
 * One topic on one channel. Saves the moment it is flipped, shows the new value at
 * once (from the submission in flight), and reverts by itself if the save fails
 * because the page then re-renders from the stored value.
 */
function PreferenceSwitch({
  row,
  channel,
  pushConfigured,
}: {
  readonly row: StaffMatrixRow;
  readonly channel: StaffChannel;
  readonly pushConfigured: boolean;
}) {
  const fetcher = useFetcher<NotificationActionResult>({ key: `preference:${row.topic}:${channel}` });
  useActionToast(fetcher.data, describeResult(fetcher.data));

  const label = CHANNEL_LABEL[channel];
  const id = `pref-${row.topic}-${channel}`;
  const pending = fetcher.state !== "idle";

  if (channel === "push" && !pushConfigured) {
    return (
      <span className="text-xs text-muted-foreground md:text-center">
        <span className="md:hidden">Push: </span>Not set up
      </span>
    );
  }

  const submitted = fetcher.formData?.get("enabled");
  const checked = submitted === undefined || submitted === null ? row[channel] : submitted === "true";

  return (
    <div className="flex items-center gap-2 md:justify-center">
      <Switch
        id={id}
        checked={checked}
        aria-label={`${row.label} by ${label.toLowerCase()}`}
        aria-busy={pending}
        onCheckedChange={(next) => {
          void fetcher.submit(
            { intent: "preference", topic: row.topic, channel, enabled: String(next) },
            { method: "post", action: NOTIFICATIONS_ACTION },
          );
        }}
      />
      {/* Visible on a phone, where the two switches sit under the label; the column headings carry it from md up. */}
      <Label htmlFor={id} aria-hidden="true" className="text-sm font-normal md:sr-only">
        {label}
      </Label>
      {/* A fixed-size slot, so the spinner appearing never moves anything. */}
      <span className="flex size-4 items-center justify-center">{pending ? <Spinner className="size-3.5" /> : null}</span>
    </div>
  );
}

function TopicRow({ row, pushConfigured }: { readonly row: StaffMatrixRow; readonly pushConfigured: boolean }) {
  return (
    <div className={`flex flex-col gap-3 py-3 ${ROW_GRID}`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{row.label}</span>
        <span className="text-sm text-muted-foreground">{row.description}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 md:contents">
        {STAFF_CHANNELS.map((channel) => (
          <PreferenceSwitch key={channel} row={row} channel={channel} pushConfigured={pushConfigured} />
        ))}
      </div>
    </div>
  );
}

export function PreferencesCard({ view }: { readonly view: NotificationSettingsView }) {
  const groups = groupMatrix(view.matrix);
  const pushConfigured = view.push.configured;

  return (
    <Card>
      <CardHeader>
        <CardTitle>What to notify me about</CardTitle>
        <CardDescription>
          Choose, for each event, whether it reaches you by email, by push on your registered devices, or both. Changes
          save as you flip them.
        </CardDescription>
        {pushConfigured ? null : (
          <p className="text-sm text-muted-foreground">
            Push is not set up for this deployment, so only email can be changed until it is.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className={`hidden pb-2 text-xs font-medium text-muted-foreground ${ROW_GRID}`} aria-hidden="true">
          <span className="md:block">Event</span>
          <span className="text-center">{CHANNEL_LABEL.email}</span>
          <span className="text-center">{CHANNEL_LABEL.push}</span>
        </div>
        {groups.map((group, index) => (
          <section key={group.group} aria-labelledby={`pref-group-${group.group}`}>
            {index > 0 ? <Separator className="my-2" /> : null}
            <h3 id={`pref-group-${group.group}`} className="pt-2 text-sm font-semibold">
              {group.label}
            </h3>
            <div className="divide-y">
              {group.rows.map((row) => (
                <TopicRow key={row.topic} row={row} pushConfigured={pushConfigured} />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
