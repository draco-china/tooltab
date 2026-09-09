import { Button, ListBox, Popover, Toast } from "@heroui/react";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { Check, Globe, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Pwa } from "@/features/pwa/register";
import { ThemePicker } from "@/features/theme/picker";
import { canonicalLocalePathname, localePath } from "@/lib/locale-path";
import {
  applyTheme,
  defaultColorTheme,
  isColorTheme,
  isThemePreference,
  resolveThemeMode,
  type ThemePreference,
} from "@/lib/theme";
import { m } from "@/paraglide/messages.js";
import {
  baseLocale,
  getLocale,
  isLocale,
  type Locale,
  locales,
  setLocale,
} from "@/paraglide/runtime.js";

const localeLabels = {
  "zh-CN": "简体中文",
  "en-US": "English",
} satisfies Record<Locale, string>;

export const Route = createFileRoute("/{-$locale}")({
  beforeLoad: ({ location, params }) => {
    if (params.locale === baseLocale) {
      const pathname = canonicalLocalePathname(location.pathname) ?? "/";
      throw redirect({
        href: `${pathname}${location.searchStr}${location.hash}`,
        statusCode: 301,
      });
    }
    if (params.locale !== undefined && !isLocale(params.locale)) {
      throw notFound();
    }
    return { locale: params.locale ?? baseLocale };
  },
  component: SiteLayout,
});

function SiteLayout() {
  const locale = getLocale();
  const location = useLocation();
  const [themeMode, setThemeMode] = useState<ThemePreference | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("tooltab-theme");
    } catch {}
    setThemeMode(isThemePreference(saved) ? saved : "system");
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!themeMode) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const resolved = resolveThemeMode(themeMode, media.matches);
      let savedPalette: string | null = null;
      try {
        savedPalette = localStorage.getItem("tooltab-palette");
      } catch {}
      applyTheme(
        resolved,
        isColorTheme(savedPalette) ? savedPalette : defaultColorTheme,
      );
    };
    update();
    if (themeMode === "system") media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themeMode]);

  function changeThemeMode(value: React.Key | null) {
    if (typeof value !== "string" || !isThemePreference(value)) return;
    setThemeMode(value);
    try {
      localStorage.setItem("tooltab-theme", value);
    } catch {}
  }

  function changeLocale(value: React.Key | null) {
    if (isLocale(value)) void setLocale(value);
  }

  const toolsActive = location.pathname.includes("/tools");
  const apiActive = location.pathname.endsWith("/api");
  const mcpActive = location.pathname.endsWith("/mcp");

  return (
    <div className="page-container flex min-h-svh flex-col gap-8 py-4 sm:gap-10 sm:py-6">
      <header>
        <nav
          className="flex min-h-12 items-center justify-between"
          aria-label={m["navigation.primarynavigation"]()}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 text-sm font-semibold text-foreground"
              to={localePath(locale)}
              aria-label="ToolTab"
            >
              <span aria-hidden className="site-logo size-8 shrink-0" />
              <span className="hidden text-lg sm:inline">ToolTab</span>
            </Link>
            <Link
              to={localePath(locale, "/tools")}
              aria-current={toolsActive ? "page" : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center text-sm transition-colors hover:text-foreground ${
                toolsActive ? "font-medium text-foreground" : "text-muted"
              }`}
            >
              {m["navigation.tools"]()}
            </Link>
            <Link
              to={localePath(locale, "/api")}
              aria-current={apiActive ? "page" : undefined}
              className={`hidden min-h-11 min-w-11 items-center justify-center text-sm transition-colors hover:text-foreground sm:inline-flex ${
                apiActive ? "font-medium text-foreground" : "text-muted"
              }`}
            >
              {m["navigation.apinav"]()}
            </Link>
            <Link
              to={localePath(locale, "/mcp")}
              aria-current={mcpActive ? "page" : undefined}
              className={`hidden min-h-11 min-w-11 items-center justify-center text-sm transition-colors hover:text-foreground sm:inline-flex ${
                mcpActive ? "font-medium text-foreground" : "text-muted"
              }`}
            >
              {m["navigation.mcpnav"]()}
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/draco-china/tooltab"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="button button--ghost inline-flex size-11 min-w-11 items-center justify-center rounded-lg"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-5"
              >
                <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.79-1.508-3.79-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.725 1.16 1.725 1.16 1.005 1.722 2.637 1.225 3.28.937.102-.729.393-1.226.715-1.508-2.498-.284-5.124-1.249-5.124-5.563 0-1.23.44-2.233 1.16-3.02-.116-.285-.503-1.43.11-2.98 0 0 .945-.302 3.094 1.154A10.78 10.78 0 0 1 12 6.182c.956.004 1.918.129 2.818.379 2.148-1.456 3.092-1.154 3.092-1.154.615 1.55.228 2.695.112 2.98.722.787 1.158 1.79 1.158 3.02 0 4.325-2.63 5.276-5.136 5.555.404.35.766 1.042.766 2.1 0 1.516-.014 2.739-.014 3.11 0 .3.203.65.774.54A11.252 11.252 0 0 0 12 .75Z" />
              </svg>
              <span className="sr-only">GitHub</span>
            </a>
            <Popover>
              <Button
                aria-label={m["navigation.theme"]()}
                variant="ghost"
                size="md"
                isIconOnly
                className="size-11 min-w-11 rounded-lg"
              >
                {themeMode === "dark" ? (
                  <Moon aria-hidden className="size-5" />
                ) : themeMode === "light" ? (
                  <Sun aria-hidden className="size-5" />
                ) : (
                  <Monitor aria-hidden className="size-5" />
                )}
              </Button>
              <Popover.Content
                placement="bottom end"
                className="w-max min-w-40"
              >
                <Popover.Dialog className="p-2">
                  <ListBox
                    aria-label={m["navigation.theme"]()}
                    selectionMode="single"
                    selectedKeys={new Set([themeMode ?? "system"])}
                    onSelectionChange={(keys) =>
                      changeThemeMode([...keys][0] ?? null)
                    }
                  >
                    <ListBox.Item
                      id="system"
                      textValue={m["navigation.themesystem"]()}
                    >
                      <span className="flex w-full items-center gap-3">
                        <Monitor aria-hidden />
                        {m["navigation.themesystem"]()}
                        {themeMode === "system" ? (
                          <Check
                            aria-hidden
                            className="ms-auto size-4 text-accent"
                          />
                        ) : null}
                      </span>
                    </ListBox.Item>
                    <ListBox.Item
                      id="light"
                      textValue={m["navigation.themelight"]()}
                    >
                      <span className="flex w-full items-center gap-3">
                        <Sun aria-hidden />
                        {m["navigation.themelight"]()}
                        {themeMode === "light" ? (
                          <Check
                            aria-hidden
                            className="ms-auto size-4 text-accent"
                          />
                        ) : null}
                      </span>
                    </ListBox.Item>
                    <ListBox.Item
                      id="dark"
                      textValue={m["navigation.themedark"]()}
                    >
                      <span className="flex w-full items-center gap-3">
                        <Moon aria-hidden />
                        {m["navigation.themedark"]()}
                        {themeMode === "dark" ? (
                          <Check
                            aria-hidden
                            className="ms-auto size-4 text-accent"
                          />
                        ) : null}
                      </span>
                    </ListBox.Item>
                  </ListBox>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
            <ThemePicker />
            <div className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Popover>
              <Button
                aria-label={m["navigation.language"]()}
                variant="ghost"
                size="md"
                isIconOnly
                className="size-11 min-w-11 rounded-lg"
              >
                <Globe aria-hidden className="size-5" />
              </Button>
              <Popover.Content
                placement="bottom end"
                className="w-max min-w-40"
              >
                <Popover.Dialog className="p-2">
                  <ListBox
                    aria-label={m["navigation.language"]()}
                    selectionMode="single"
                    selectedKeys={new Set([locale])}
                    onSelectionChange={(keys) =>
                      changeLocale([...keys][0] ?? null)
                    }
                  >
                    {locales.map((item) => (
                      <ListBox.Item key={item} id={item} textValue={item}>
                        <span className="flex w-full items-center justify-between gap-3">
                          {localeLabels[item]}
                          {locale === item ? (
                            <Check aria-hidden className="size-4 text-accent" />
                          ) : null}
                        </span>
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          </div>
        </nav>
      </header>
      {offline ? (
        <p
          role="status"
          className="mx-auto max-w-2xl border-y border-border px-4 py-3 text-center text-sm text-muted"
        >
          {m["navigation.offline"]()}
        </p>
      ) : null}
      <Pwa />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-5 text-sm text-muted">
        <p className="m-0">ToolTab — {m["navigation.tagline"]()}</p>
        <nav
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
          aria-label={m["navigation.footernavigation"]()}
        >
          <Link
            className="transition-colors hover:text-foreground"
            to={localePath(locale, "/tools")}
          >
            {m["navigation.tools"]()}
          </Link>
          <a
            className="transition-colors hover:text-foreground"
            href="https://github.com/draco-china/tooltab"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <Link
            className="transition-colors hover:text-foreground"
            to={localePath(locale, "/api")}
          >
            {m["navigation.apinav"]()}
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            to={localePath(locale, "/mcp")}
          >
            {m["navigation.mcpnav"]()}
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            to={localePath(locale, "/privacy")}
          >
            {m["legal.privacytitle"]()}
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            to={localePath(locale, "/terms")}
          >
            {m["legal.termstitle"]()}
          </Link>
        </nav>
      </footer>
      <Toast.Provider />
    </div>
  );
}
