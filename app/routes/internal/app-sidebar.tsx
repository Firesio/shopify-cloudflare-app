import { Link } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "~/internal/components/ui/sidebar";
import { AppMark } from "~/internal/components";
import { identity } from "~/identity";
import { INTERNAL_NAV } from "./layout-nav";
import { NavUser } from "./nav-user";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  readonly pathname: string;
  readonly user: { readonly name: string; readonly email: string };
}

/** The console's sidebar: dashboard-01's shell, driven by INTERNAL_NAV. */
export function AppSidebar({ pathname, user, ...props }: AppSidebarProps) {
  // On a phone the sidebar is a sheet over the page: a nav tap must close it, or the
  // new page loads hidden behind it. On desktop it is part of the layout and stays.
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/internal/dashboard" prefetch="intent" onClick={closeOnMobile}>
                <AppMark className="size-5!" />
                <span className="text-base font-semibold">{identity.brandName}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {INTERNAL_NAV.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                    >
                      <Link to={item.href} prefetch="intent" onClick={closeOnMobile}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
