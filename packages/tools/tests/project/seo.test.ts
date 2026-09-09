import { describe, expect, it } from "vitest";
import {
  aiAgents,
  executeSeo,
  MAX_SEO_INPUT,
  frequencies,
  robotsPreset,
  robotsSchema,
  searchAgents,
  sitemapPreset,
  sitemapSchema,
} from "@workspace/tools/project/seo";

const robots = (overrides: Partial<ReturnType<typeof robotsPreset>> = {}) => ({
  ...robotsPreset("allowAll"),
  ...overrides,
});
const sitemap = (
  overrides: Partial<ReturnType<typeof sitemapPreset>> = {},
) => ({ ...sitemapPreset("standard"), ...overrides });

function expectCode(action: () => unknown, code: string) {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("SEO presets and schemas", () => {
  it("provides every robots preset with the expected rules", () => {
    expect(robotsPreset("allowAll").groups[0]?.rules).toEqual([]);
    expect(robotsPreset("disallowAll").groups[0]?.rules).toEqual([
      { type: "disallow", path: "/" },
    ]);
    expect(robotsPreset("blockAdmin").groups[0]?.rules).toEqual([
      { type: "disallow", path: "/admin/" },
    ]);
    expect(searchAgents.length).toBeGreaterThan(5);
    expect(aiAgents).toContain("GPTBot");
  });

  it("provides all sitemap presets and the complete frequency list", () => {
    expect(frequencies).toEqual([
      "always",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "yearly",
      "never",
    ]);
    expect(sitemapPreset("standard").mode).toBe("urlset");
    expect(sitemapPreset("content").urlEntries).toHaveLength(3);
    expect(sitemapPreset("index")).toMatchObject({
      mode: "sitemapindex",
      sitemapEntries: [
        { loc: "/sitemaps/pages.xml", lastmod: "2026-04-20" },
        { loc: "/sitemaps/blog.xml", lastmod: "2026-04-20" },
      ],
    });
  });

  it("applies schema defaults and rejects unknown fields", () => {
    expect(robotsSchema.parse({ groups: [] })).toEqual({
      groups: [],
      sitemaps: [],
      host: "",
      advanced: false,
    });
    expect(sitemapSchema.parse({})).toEqual({
      mode: "urlset",
      baseUrl: "",
      autoJoin: true,
      urlEntries: [],
      sitemapEntries: [],
    });
    expect(() => robotsSchema.parse({ groups: [], extra: true })).toThrow();
    expect(() =>
      sitemapSchema.parse({ urlEntries: [{ loc: "x", nope: 1 }] }),
    ).toThrow();
  });
});

describe("robots execution", () => {
  it("renders rules, empty agents, host, delay, and sitemap lines", () => {
    const result = executeSeo({
      kind: "robots",
      state: robots({
        advanced: true,
        host: " https://example.com ",
        groups: [
          {
            userAgents: [" ", "Googlebot"],
            rules: [
              { type: "allow", path: "/public" },
              { type: "disallow", path: "admin" },
            ],
            crawlDelay: 2.5,
          },
          { userAgents: [], rules: [], crawlDelay: null },
        ],
        sitemaps: [" https://example.com/sitemap.xml ", ""],
      }),
    });
    expect(result.filename).toBe("robots.txt");
    expect(result.count).toBe(2);
    expect(result.output).toContain("Host: https://example.com");
    expect(result.output).toContain("User-agent: Googlebot");
    expect(result.output).toContain("User-agent: *");
    expect(result.output).toContain("Allow: /public");
    expect(result.output).toContain("Disallow: admin");
    expect(result.output).toContain("Crawl-delay: 2.5");
    expect(result.output).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "nonstandard_host",
        "crawler_specific_delay",
        "nonstandard_path",
      ]),
    );
    expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
  });

  it("renders a minimal allow-all file without warnings", () => {
    const result = executeSeo({ kind: "robots", state: robots() });
    expect(result.output).toBe("User-agent: *");
    expect(result.count).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("rejects a real JSON state above the input byte limit", () => {
    expectCode(
      () =>
        executeSeo({
          kind: "robots",
          state: robots({ host: "x".repeat(MAX_SEO_INPUT + 1) }),
        }),
      "too_large",
    );
  });

  it("warns when rendered robots output exceeds 500 KiB", () => {
    const result = executeSeo({
      kind: "robots",
      state: robots({
        groups: [
          {
            userAgents: ["*"],
            rules: Array.from({ length: 1000 }, (_, index) => ({
              type: "disallow" as const,
              path: `/${index}-${"x".repeat(600)}`,
            })),
            crawlDelay: null,
          },
        ],
      }),
    });
    expect(result.count).toBe(1000);
    expect(result.bytes).toBeGreaterThan(500 * 1024);
    expect(result.warnings).toContain("large_robots_file");
  });

  it("rejects invalid robots state", () => {
    expect(() =>
      executeSeo({
        kind: "robots",
        state: robots({
          groups: [{ userAgents: ["\u0000"], rules: [], crawlDelay: null }],
        }),
      }),
    ).toThrow();
  });
});

describe("sitemap execution", () => {
  it("renders urlset entries with URL joining, XML escaping, fields, and byte count", () => {
    const result = executeSeo({
      kind: "sitemap",
      state: sitemap({
        baseUrl: "https://example.com/base/",
        urlEntries: [
          {
            loc: "posts?a=1&b=2",
            lastmod: "2026-04-20T12:30:00+05:30",
            changefreq: "daily",
            priority: "0.75",
          },
          {
            loc: "https://other.example/a?<x>",
            lastmod: "2026-04-20",
            changefreq: "never",
            priority: "",
          },
        ],
      }),
    });
    expect(result.filename).toBe("sitemap.xml");
    expect(result.count).toBe(2);
    expect(result.output).toContain(
      "https://example.com/base/posts?a=1&amp;b=2",
    );
    expect(result.output).toContain("https://other.example/a?%3Cx%3E");
    expect(result.output).toContain("<changefreq>daily</changefreq>");
    expect(result.output).toContain("<priority>0.8</priority>");
    expect(result.warnings).toContain("multiple_hosts");
    expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
  });

  it("renders sitemap indexes and skips blank locations", () => {
    const result = executeSeo({
      kind: "sitemap",
      state: {
        ...sitemapPreset("index"),
        sitemapEntries: [
          { loc: "", lastmod: "" },
          { loc: "/pages.xml", lastmod: "2026-04-20" },
        ],
      },
    });
    expect(result.filename).toBe("sitemap-index.xml");
    expect(result.count).toBe(1);
    expect(result.output).toContain("<sitemap>");
    expect(result.output).toContain("https://example.com/pages.xml");
  });

  it("returns empty output when all sitemap locations are blank", () => {
    const result = executeSeo({
      kind: "sitemap",
      state: sitemap({
        urlEntries: [{ loc: "", lastmod: "", changefreq: "", priority: "" }],
      }),
    });
    expect(result).toEqual({
      output: "",
      bytes: 0,
      count: 0,
      warnings: [],
      filename: "sitemap.xml",
    });
  });

  it("validates location, date, timezone, and priority errors with indexes", () => {
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            baseUrl: "not-url",
            urlEntries: [
              { loc: "/x", lastmod: "", changefreq: "", priority: "" },
            ],
          }),
        }),
      "invalid_base_url",
    );
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            autoJoin: false,
            urlEntries: [
              { loc: "/x", lastmod: "", changefreq: "", priority: "" },
            ],
          }),
        }),
      "invalid_location",
    );
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            urlEntries: [
              {
                loc: "/x",
                lastmod: "2026-02-30",
                changefreq: "",
                priority: "",
              },
            ],
          }),
        }),
      "invalid_lastmod",
    );
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            urlEntries: [
              {
                loc: "/x",
                lastmod: "2026-04-20T00:00:00+14:01",
                changefreq: "",
                priority: "",
              },
            ],
          }),
        }),
      "invalid_lastmod",
    );
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            urlEntries: [
              { loc: "/x", lastmod: "", changefreq: "", priority: "1.1" },
            ],
          }),
        }),
      "invalid_priority",
    );
  });

  it("rejects a sitemap whose real UTF-8 URL output exceeds 50 MiB", () => {
    const loc = `https://example.com/${"界".repeat(4000)}`;
    const state = sitemap({
      urlEntries: Array.from({ length: 1600 }, () => ({
        loc,
        lastmod: "",
        changefreq: "",
        priority: "",
      })),
    });
    expect(new TextEncoder().encode(JSON.stringify(state)).length).toBeLessThan(
      MAX_SEO_INPUT,
    );
    expect(() => executeSeo({ kind: "sitemap", state })).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  it("warns for long URLs", () => {
    const result = executeSeo({
      kind: "sitemap",
      state: sitemap({
        urlEntries: [
          {
            loc: `/${"a".repeat(2050)}`,
            lastmod: "",
            changefreq: "",
            priority: "",
          },
        ],
      }),
    });
    expect(result.warnings).toContain("long_url");
  });
});

describe("sitemap and robots edge validation", () => {
  it("rejects unsupported absolute and base protocols", () => {
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            urlEntries: [
              {
                loc: "ftp://example.com/a",
                lastmod: "",
                changefreq: "",
                priority: "",
              },
            ],
          }),
        }),
      "invalid_location",
    );
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            baseUrl: "ftp://example.com",
            urlEntries: [
              { loc: "/a", lastmod: "", changefreq: "", priority: "" },
            ],
          }),
        }),
      "invalid_base_url",
    );
    expectCode(
      () =>
        executeSeo({
          kind: "sitemap",
          state: sitemap({
            urlEntries: [
              { loc: "//[", lastmod: "", changefreq: "", priority: "" },
            ],
          }),
        }),
      "invalid_location",
    );
  });

  it("skips empty robots rule paths", () => {
    const result = executeSeo({
      kind: "robots",
      state: robots({
        groups: [
          {
            userAgents: ["*"],
            rules: [{ type: "disallow", path: "  " }],
            crawlDelay: null,
          },
        ],
      }),
    });
    expect(result.output).toBe("User-agent: *");
    expect(result.count).toBe(0);
  });

  it("accepts Z and negative timezone lastmod values", () => {
    const result = executeSeo({
      kind: "sitemap",
      state: sitemap({
        urlEntries: [
          {
            loc: "/z",
            lastmod: "2026-04-20T12:30:00Z",
            changefreq: "",
            priority: "",
          },
          {
            loc: "/negative",
            lastmod: "2026-04-20T12:30:00-05:30",
            changefreq: "",
            priority: "",
          },
        ],
      }),
    });
    expect(result.count).toBe(2);
    expect(result.output).toContain("2026-04-20T12:30:00Z");
    expect(result.output).toContain("2026-04-20T12:30:00-05:30");
  });

  it.each([
    "bad",
    "2026-04-20T24:00:00Z",
    "2026-04-20T23:60:00Z",
    "2026-04-20T23:59:60Z",
    "2026-04-20T23:59:00+15:00",
    "2026-04-20T23:59:00+00:60",
  ])("rejects invalid lastmod %s and reports its entry index", (lastmod) => {
    try {
      executeSeo({
        kind: "sitemap",
        state: sitemap({
          urlEntries: [
            {
              loc: "/valid",
              lastmod: "2026-04-20",
              changefreq: "",
              priority: "",
            },
            { loc: "/invalid", lastmod, changefreq: "", priority: "" },
          ],
        }),
      });
      throw new Error("expected invalid lastmod");
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid_lastmod", index: 1 });
    }
  });
});
