import "@firesio/app/ui/devices/public.css";
import { Outlet } from "react-router";

/**
 * The shell of the phone app's two public pages (`/m`, `/m/start`): bare on purpose, no site navigation and no footer, because these pages belong
 * to the installed app. The package's stylesheet is imported HERE and by nothing else, so it ships only while a `/m` page is matched.
 * Only mounted while `PWA` is on (`app/core/features.ts`).
 */
export default function PhonePublicLayout() {
  return (
    <main>
      <Outlet />
    </main>
  );
}
