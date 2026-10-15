import { Suspense } from "react";
import {
  Link,
  Outlet,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { ShieldAlert } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import { CommandMenu } from "./command-menu";
import { titleFor } from "./layout-nav";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/internal/components/ui/empty";
import { Separator } from "~/internal/components/ui/separator";
import { Skeleton } from "~/internal/components/ui/skeleton";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/internal/components/ui/sidebar";
import { Toaster } from "~/internal/components/ui/sonner";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminSessionUsers } from "~/wiring.server";
import {
  INTERNAL_FONT_LINKS,
  ThemeToggle,
  THEME_INIT_SCRIPT,
  useIsDarkTheme,
} from "~/internal/components";
// Tailwind v4 + shadcn/ui styles, scoped to /internal by THIS route's
// links(): React Router only injects it while an internal route is matched, so
// Tailwind's Preflight never reaches the Polaris merchant app or the SCSS public
// pages. See .claude/rules/styling.md.
import internalStyles from "~/styles/internal/internal.tailwind.css?url";

export const meta: MetaFunction = () => [
  { title: "Staff Console" },
  { name: "robots", content: "noindex, nofollow" },
  // The browser chrome of an installed console follows the theme.
  { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
  { name: "theme-color", content: "#0a0a0a", media: "(prefers-color-scheme: dark)" },
];

export const links: LinksFunction = () => [
  ...INTERNAL_FONT_LINKS,
  { rel: "stylesheet", href: internalStyles },
  // Installable console (and the only way web push works on iOS).
  { rel: "manifest", href: "/internal/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/internal-icons/apple-touch-icon.png" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // The auth guard for the whole console. Child loaders still enforce their own
  // requirements (an owner-only page calls requireOwner), so this is defence in
  // depth, not the only check.
  const user = await requireAdminUser(request, { users: adminSessionUsers() });
  return { user };
};

/**
 * The shell's only data is the signed-in user. It does not change while moving
 * between console pages, so skip re-running this loader on client navigations —
 * one less round-trip per click.
 */
export const shouldRevalidate = () => false;

/**
 * Top progress bar — immediate feedback on every client navigation, so a slow
 * loader never makes the console feel frozen.
 */
function NavProgress() {
  const navigation = useNavigation();
  const active = navigation.state !== "idle";
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 transition-opacity duration-300"
      style={{ opacity: active ? 1 : 0 }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: active ? "92%" : "0%",
          transition: active
            ? "width 8s cubic-bezier(0.1,0.75,0.15,1)"
            : "width .2s ease",
        }}
      />
    </div>
  );
}

/** Shown the instant a navigation starts: the shape every console page shares (title, stat row, content). */
function PageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-2 px-4 lg:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="px-4 lg:px-6">
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function InternalLayout() {
  const { user } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const dark = useIsDarkTheme();
  // Moving to another page: swap in the skeleton the moment the click lands,
  // rather than leaving the old page on screen until the next loader answers.
  // A form submission or a same-page revalidation keeps the page as it is.
  const navigatingAway =
    navigation.state === "loading" &&
    navigation.formData === undefined &&
    navigation.location.pathname !== pathname;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <NavProgress />
      <Toaster theme={dark ? "dark" : "light"} />
      <SidebarProvider>
        <AppSidebar variant="inset" pathname={pathname} user={user} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
              <h1 className="text-base font-medium">{titleFor(pathname)}</h1>
              <div className="ml-auto flex items-center gap-2">
                <CommandMenu />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <div className="@container/main flex flex-1 flex-col">
            {navigatingAway ? (
              <PageSkeleton />
            ) : (
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

/**
 * Console-scoped error boundary: a failed child route shows an Empty state
 * instead of a raw stack. This route's links() still apply, so the stylesheet is
 * present here.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const is403 = isRouteErrorResponse(error) && error.status === 403;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>
              {is404
                ? "Page not found"
                : is403
                  ? "You do not have access to that"
                  : "Something went wrong"}
            </EmptyTitle>
            <EmptyDescription>
              <Link to="/internal/dashboard">Back to the dashboard</Link>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </>
  );
}
