import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/internal/components/ui/dropdown-menu";

export const THEME_KEY = "internal-theme";

/**
 * Render-blocking script that applies the stored (or system) theme to <html>
 * before first paint, so there is no light→dark flash on load. Embed once, near
 * the top of the console layout.
 */
// Only the storage read can throw (blocked or disabled storage): that case falls
// back to "no saved choice", so the OS preference still decides the theme.
export const THEME_INIT_SCRIPT = `(function(){var s=null;try{s=localStorage.getItem('${THEME_KEY}');}catch(e){s=null;}var d=(s==='dark'||s==='light')?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);})();`;

/**
 * Watch the `class` attribute on <html>. The theme lives in the DOM (the init
 * script above puts it there before React exists), so the DOM is the source of
 * truth and React subscribes to it — rather than keeping a second copy in state
 * and syncing it in an effect, which would be a second source of truth and a
 * hydration mismatch waiting to happen.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");
/** The server has no DOM and renders the light icon; the observer corrects it. */
const isDarkOnServer = () => false;

/**
 * The console's current theme, read from the DOM `subscribe`/`isDark` above —
 * shared with anything else that needs to match it (the toast layer's
 * `Toaster theme=`), so there is exactly one source of truth for "is it dark".
 */
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, isDarkOnServer);
}

export type ThemeMode = "light" | "dark" | "system";

const MODE_EVENT = "internal-theme-change";
const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** The saved choice; "system" when nothing (valid) is saved or storage is blocked. */
function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribeMode(onChange: () => void): () => void {
  window.addEventListener(MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Apply and remember a theme (shadcn's light / dark / system). Also used by the command menu. */
export function setThemeMode(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "system" ? prefersDark() : mode === "dark");
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private mode / storage disabled — the choice still applies for this session.
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}

function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/** While on "system", follow the OS when it flips. */
function useFollowSystem(mode: ThemeMode) {
  useEffect(() => {
    if (mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => document.documentElement.classList.toggle("dark", query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [mode]);
}

/** shadcn's mode toggle: a sun/moon button opening Light / Dark / System. */
export function ThemeToggle() {
  const mode = useSyncExternalStore<ThemeMode>(subscribeMode, readMode, () => "system");
  useFollowSystem(mode);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isThemeMode(value)) setThemeMode(value);
          }}
        >
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
