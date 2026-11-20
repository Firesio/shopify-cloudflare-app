import type { PhoneNavItem } from "@firesio/app/ui/devices";
import { PHONE_PATHS } from "~/core/phone";

/** The bottom bar of the phone: the places a staff member opens most. Keep it to what the deny-list leaves open; more than five go under "More". */
export function phoneItems(): readonly PhoneNavItem[] {
  return [
    { href: "/app", label: "Home", icon: "home", exact: true },
    { href: "/app/support", label: "Support", icon: "chat" },
    { href: PHONE_PATHS.manage, label: "Phones", icon: "mobile" },
  ];
}
