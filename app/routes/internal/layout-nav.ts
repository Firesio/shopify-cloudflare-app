import {
  LayoutGrid,
  Users,
  Receipt,
  Store,
  LifeBuoy,
  Cpu,
  Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SubmitOptions } from "react-router";

export interface NavItem {
  readonly title: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/** The console's sidebar, declared as data beside the layout that renders it. */
export const INTERNAL_NAV: readonly NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/internal/dashboard", icon: LayoutGrid },
      { title: "Shops", href: "/internal/shops", icon: Store },
      { title: "Support", href: "/internal/support", icon: LifeBuoy },
    ],
  },
  {
    title: "Team",
    items: [
      { title: "Admins", href: "/internal/admins", icon: Users },
      { title: "Subscriptions", href: "/internal/subscriptions", icon: Receipt },
      { title: "AI", href: "/internal/ai", icon: Cpu },
      { title: "MCP & API", href: "/internal/mcp", icon: Bot },
    ],
  },
];

interface TitledPath {
  readonly href: string;
  readonly title: string;
}

/** Pages reachable from the shell (the account menu) that are not in the sidebar. */
const EXTRA_PAGES: readonly TitledPath[] = [
  { href: "/internal/profile", title: "Profile" },
  { href: "/internal/notifications", title: "Notifications" },
];

/** The page title shown in the shell header: the longest known path that prefixes `pathname`. */
export function titleFor(pathname: string): string {
  const pages: readonly TitledPath[] = [...INTERNAL_NAV.flatMap((group) => group.items), ...EXTRA_PAGES];
  let best: TitledPath | undefined;
  for (const page of pages) {
    const matches = pathname === page.href || pathname.startsWith(`${page.href}/`);
    if (matches && (best === undefined || page.href.length > best.href.length)) best = page;
  }
  return best?.title ?? "Staff console";
}

/** Ending a session is a POST, never a link: a GET that signs you out is fired by prefetchers and image tags. */
export const LOGOUT: SubmitOptions = { method: "post", action: "/internal/logout" };
