import { Temporal } from "@js-temporal/polyfill";
import { escapeUTF8 } from "entities";
import * as z from "zod/v4";

export const MAX_SEO_INPUT = 32 * 1048576,
  MAX_SEO_OUTPUT = 50 * 1048576;
export class SeoError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "invalid_location"
      | "invalid_base_url"
      | "invalid_lastmod"
      | "invalid_priority"
      | "invalid_delay"
      | "too_large"
      | "timeout"
      | "unsupported"
      | "busy"
      | "read_failed",
    public index?: number,
  ) {
    super(code);
  }
}
export const frequencies = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
] as const;
export const searchAgents = [
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "Applebot",
  "Naverbot",
  "SeznamBot",
  "Sogou web spider",
  "Qwantify",
  "Yahoo! Slurp",
  "Exabot",
];
export const aiAgents = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
];
export type RobotsGroup = {
  userAgents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
  crawlDelay: number | null;
};
export type RobotsState = {
  groups: RobotsGroup[];
  sitemaps: string[];
  host: string;
  advanced: boolean;
};
export function robotsPreset(
  preset: "allowAll" | "disallowAll" | "blockAdmin",
): RobotsState {
  return {
    groups: [
      {
        userAgents: ["*"],
        rules:
          preset === "allowAll"
            ? []
            : [
                {
                  type: "disallow",
                  path: preset === "disallowAll" ? "/" : "/admin/",
                },
              ],
        crawlDelay: null,
      },
    ],
    sitemaps: [],
    host: "",
    advanced: false,
  };
}
export type SitemapEntry = {
  loc: string;
  lastmod: string;
  changefreq: (typeof frequencies)[number] | "";
  priority: string;
};
export type SitemapState = {
  mode: "urlset" | "sitemapindex";
  baseUrl: string;
  autoJoin: boolean;
  urlEntries: SitemapEntry[];
  sitemapEntries: Pick<SitemapEntry, "loc" | "lastmod">[];
};
export function sitemapPreset(
  preset: "standard" | "content" | "index",
): SitemapState {
  const rows: [string, string, SitemapEntry["changefreq"], string][] =
    preset === "content"
      ? [
          ["/blog", "2026-04-01", "daily", "0.8"],
          ["/blog/launch-notes", "2026-04-18", "weekly", "0.7"],
          ["/changelog", "2026-04-20", "daily", "0.6"],
        ]
      : preset === "index"
        ? [["/", "", "", ""]]
        : [
            ["/", "2026-04-20", "daily", "1.0"],
            ["/about", "2026-04-14", "monthly", "0.6"],
            ["/pricing", "2026-04-18", "weekly", "0.8"],
          ];
  return {
    mode: preset === "index" ? "sitemapindex" : "urlset",
    baseUrl: "https://example.com",
    autoJoin: true,
    urlEntries: rows.map(([loc, lastmod, changefreq, priority]) => ({
      loc,
      lastmod,
      changefreq,
      priority,
    })),
    sitemapEntries:
      preset === "index"
        ? [
            { loc: "/sitemaps/pages.xml", lastmod: "2026-04-20" },
            { loc: "/sitemaps/blog.xml", lastmod: "2026-04-20" },
          ]
        : [{ loc: "/sitemap.xml", lastmod: "" }],
  };
}
export type SeoJob =
  | { kind: "robots"; state: RobotsState }
  | { kind: "sitemap"; state: SitemapState };
export type SeoResult = {
  output: string;
  bytes: number;
  count: number;
  warnings: string[];
  filename: string;
};

const line = z
  .string()
  .max(16384)
  .refine((value) => !/[\p{Cc}\p{Cs}]/u.test(value));
export const robotsSchema = z.strictObject({
  groups: z
    .array(
      z.strictObject({
        userAgents: z.array(line).max(1000),
        rules: z
          .array(
            z.strictObject({ type: z.enum(["allow", "disallow"]), path: line }),
          )
          .max(50000),
        crawlDelay: z.number().finite().min(0).nullable().default(null),
      }),
    )
    .max(1000),
  sitemaps: z.array(line).max(50000).default([]),
  host: line.default(""),
  advanced: z.boolean().default(false),
});
const entry = z.strictObject({
  loc: line,
  lastmod: line.default(""),
  changefreq: z.enum(["", ...frequencies]).default(""),
  priority: line.default(""),
});
export const sitemapSchema = z.strictObject({
  mode: z.enum(["urlset", "sitemapindex"]).default("urlset"),
  baseUrl: line.default(""),
  autoJoin: z.boolean().default(true),
  urlEntries: z.array(entry).max(50000).default([]),
  sitemapEntries: z
    .array(entry.pick({ loc: true, lastmod: true }))
    .max(50000)
    .default([]),
});
function location(value: string, base: string, join: boolean, index: number) {
  const input = value.trim();
  if (!input) return null;
  let absolute: URL | undefined;
  try {
    absolute = new URL(input);
  } catch {}
  function checked(url: URL) {
    if (!["http:", "https:"].includes(url.protocol))
      throw new SeoError("invalid_location", index);
    return url;
  }
  if (absolute) return checked(absolute);
  if (!join) throw new SeoError("invalid_location", index);
  let origin: URL;
  try {
    origin = new URL(base.trim());
    if (!["http:", "https:"].includes(origin.protocol)) throw Error();
  } catch {
    throw new SeoError("invalid_base_url", index);
  }
  try {
    return checked(new URL(input, origin));
  } catch {
    throw new SeoError("invalid_location", index);
  }
}
function lastmod(value: string, index: number) {
  const text = value.trim();
  if (!text) return "";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
      Temporal.PlainDate.from(text, { overflow: "reject" });
      return text;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
        text,
      )
    )
      throw Error();
    const suffix = text.slice(-6);
    if (suffix[0] === "+" || suffix[0] === "-") {
      const hour = Number(suffix.slice(1, 3)),
        minute = Number(suffix.slice(4));
      if (hour > 14 || minute > 59 || (hour === 14 && minute !== 0))
        throw Error();
    }
    if (
      Number(text.slice(11, 13)) > 23 ||
      Number(text.slice(14, 16)) > 59 ||
      Number(text.slice(17, 19)) > 59
    )
      throw Error();
    Temporal.Instant.from(text.replace(/(\.\d{9})\d+/u, "$1"));
    return text;
  } catch {
    throw new SeoError("invalid_lastmod", index);
  }
}
export function executeSeo(job: SeoJob): SeoResult {
  if (
    new TextEncoder().encode(JSON.stringify(job.state)).length > MAX_SEO_INPUT
  )
    throw new SeoError("too_large");
  let bytes = 0;
  const chunks: string[] = [],
    warnings = new Set<string>();
  function append(part: string) {
    bytes += new TextEncoder().encode(part).length;
    if (bytes > MAX_SEO_OUTPUT) throw new SeoError("too_large");
    chunks.push(part);
  }
  if (job.kind === "robots") {
    const p = robotsSchema.parse(job.state);
    let count = 0;
    const sections: string[] = [];
    if (p.advanced && p.host.trim()) {
      sections.push(`Host: ${p.host.trim()}`);
      warnings.add("nonstandard_host");
    }
    for (const group of p.groups) {
      const agents = group.userAgents.map((x) => x.trim()).filter(Boolean);
      if (!agents.length) agents.push("*");
      const lines = agents.map((agent) => `User-agent: ${agent}`);
      for (const rule of group.rules) {
        const path = rule.path.trim();
        if (path) {
          lines.push(
            `${rule.type === "allow" ? "Allow" : "Disallow"}: ${path}`,
          );
          count++;
          if (!path.startsWith("/")) warnings.add("nonstandard_path");
        }
      }
      if (p.advanced && group.crawlDelay !== null) {
        lines.push(`Crawl-delay: ${group.crawlDelay}`);
        warnings.add("crawler_specific_delay");
      }
      sections.push(lines.join("\n"));
    }
    const maps = p.sitemaps
      .map((x) => x.trim())
      .filter(Boolean)
      .map((value) => `Sitemap: ${value}`);
    if (maps.length) sections.push(maps.join("\n"));
    for (const [index, section] of sections.entries())
      append(`${index ? "\n\n" : ""}${section}`);
    if (bytes > 500 * 1024) warnings.add("large_robots_file");
    return {
      output: chunks.join(""),
      bytes,
      count,
      warnings: [...warnings],
      filename: "robots.txt",
    };
  }
  const p = sitemapSchema.parse(job.state),
    entries = p.mode === "urlset" ? p.urlEntries : p.sitemapEntries;
  let count = 0;
  const hosts = new Set<string>();
  const node = p.mode === "urlset" ? "url" : "sitemap";
  append(
    `<?xml version="1.0" encoding="UTF-8"?>\n<${p.mode} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  );
  for (const [index, entry] of entries.entries()) {
    const url = location(entry.loc, p.baseUrl, p.autoJoin, index);
    if (!url) continue;
    hosts.add(url.host);
    if (url.href.length >= 2048) warnings.add("long_url");
    const date = lastmod(entry.lastmod, index);
    let part = `\n  <${node}>\n    <loc>${escapeUTF8(url.href)}</loc>`;
    if (date) part += `\n    <lastmod>${escapeUTF8(date)}</lastmod>`;
    if ("changefreq" in entry && entry.changefreq)
      part += `\n    <changefreq>${entry.changefreq}</changefreq>`;
    if (
      "priority" in entry &&
      typeof entry.priority === "string" &&
      entry.priority.trim()
    ) {
      const value = Number(entry.priority);
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new SeoError("invalid_priority", index);
      part += `\n    <priority>${value.toFixed(1)}</priority>`;
    }
    append(`${part}\n  </${node}>`);
    count++;
  }
  if (hosts.size > 1) warnings.add("multiple_hosts");
  append(`\n</${p.mode}>`);
  return {
    output: count ? chunks.join("") : "",
    bytes: count ? bytes : 0,
    count,
    warnings: [...warnings],
    filename: p.mode === "urlset" ? "sitemap.xml" : "sitemap-index.xml",
  };
}
