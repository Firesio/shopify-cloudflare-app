import { useLoaderData } from "react-router";
import { usePushDelivery } from "~/internal/push/use-push-delivery";
import type { loader } from "../notifications";
import { DevicesCard } from "./devices-card";
import { PreferencesCard } from "./preferences-card";

/**
 * A person's own notification settings: which events reach them, and on which devices push arrives. The page
 * title lives in the shell header, so there is no heading here.
 */
export function NotificationsPage() {
  const view = useLoaderData<typeof loader>();
  usePushDelivery();

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
        <PreferencesCard view={view} />
        <DevicesCard view={view} />
      </div>
    </div>
  );
}
