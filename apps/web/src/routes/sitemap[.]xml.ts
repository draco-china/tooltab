import { createFileRoute } from "@tanstack/react-router";
import { tools } from "@/features/tools/catalog/registry";
import { localePath } from "@/lib/locale-path";
import { siteOrigin } from "@/lib/site-origin";
import { baseLocale, locales } from "@/paraglide/runtime.js";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c] ?? c,
  );
export function sitemapXml(origin: string) {
  const paths = [
    "",
    "/tools",
    "/api",
    "/mcp",
    "/privacy",
    "/terms",
    ...tools.map((tool) => `/tools/${tool.id}`),
  ];
  const urls = locales.flatMap((locale) =>
    paths.map(
      (path) =>
        `<url><loc>${escapeXml(`${origin}${localePath(locale, path)}`)}</loc>${locales.map((alternateLocale) => `<xhtml:link rel="alternate" hreflang="${alternateLocale}" href="${escapeXml(`${origin}${localePath(alternateLocale, path)}`)}"/>`).join("")}<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${origin}${localePath(baseLocale, path)}`)}"/></url>`,
    ),
  );
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = siteOrigin(new URL(request.url).origin);
        return new Response(sitemapXml(origin), {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        });
      },
    },
  },
});
