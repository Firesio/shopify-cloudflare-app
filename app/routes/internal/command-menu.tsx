import { useEffect, useState } from "react";
import { useNavigate, useSubmit } from "react-router";
import { LogOut, Monitor, Moon, Plus, Search, Sun, UserCircle } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/internal/components/ui/command";
import { Kbd, KbdGroup } from "~/internal/components/ui/kbd";
import { setThemeMode, type ThemeMode } from "~/internal/components/ThemeToggle";
import { INTERNAL_NAV, LOGOUT } from "./layout-nav";

const THEMES: ReadonlyArray<{ readonly mode: ThemeMode; readonly label: string; readonly icon: typeof Sun }> = [
  { mode: "light", label: "Light theme", icon: Sun },
  { mode: "dark", label: "Dark theme", icon: Moon },
  { mode: "system", label: "System theme", icon: Monitor },
];

/**
 * ⌘K / Ctrl+K palette (shadcn `command`): jump to any page, start common
 * actions, switch theme or sign out without reaching for the mouse.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const submit = useSubmit();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-muted-foreground sm:w-56 sm:justify-start"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="hidden sm:inline">Search…</span>
        <span className="sr-only sm:hidden">Search</span>
        <KbdGroup className="ml-auto hidden sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search the console" description="Jump to a page or run an action.">
        <CommandInput placeholder="Type a page or an action…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {INTERNAL_NAV.map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map((item) => (
                <CommandItem key={item.href} value={`${group.title} ${item.title}`} onSelect={() => run(() => void navigate(item.href))}>
                  <item.icon />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => void navigate("/internal/support/new"))}>
              <Plus />
              <span>New support ticket</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => void navigate("/internal/profile"))}>
              <UserCircle />
              <span>Account</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => void submit(null, LOGOUT))}>
              <LogOut />
              <span>Log out</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Theme">
            {THEMES.map(({ mode, label, icon: Icon }) => (
              <CommandItem key={mode} onSelect={() => run(() => setThemeMode(mode))}>
                <Icon />
                <span>{label}</span>
                {mode === "system" ? null : <CommandShortcut>{mode === "light" ? "☀" : "☾"}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
