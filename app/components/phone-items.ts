import type { PhoneNavItem } from "@firesio/app/ui/devices";
import { PHONE_PATHS } from "~/core/phone";
import type { NavLabels } from "~/i18n/labels";

/** The bottom bar of the phone: the places a staff member opens most. Keep it to what the deny-list leaves open; more than five go under "More". The words are the menu's (`navLabelsOf`). */
export function phoneItems(labels: NavLabels): readonly PhoneNavItem[] {
  return [
    { href: "/app", label: labels.home, icon: "home", exact: true },
    { href: "/app/support", label: labels.support, icon: "chat" },
    { href: PHONE_PATHS.manage, label: labels.phones, icon: "mobile" },
  ];
}
