import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { NotFoundPage } from "@/features/not-found/page";
import { getThemeInitializationScript } from "@/lib/theme";
import { getLocale, getTextDirection } from "@/paraglide/runtime.js";

import styles from "@/styles/index.css?url";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ToolTab" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: Root,
  notFoundComponent: NotFoundPage,
});
function Root() {
  const locale = getLocale();
  return (
    <html lang={locale} dir={getTextDirection(locale)} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script>{getThemeInitializationScript()}</script>
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
