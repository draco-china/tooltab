import settings from "./settings.json" with { type: "json" };

export const localeStrategy =
  /** @type {Array<"url" | "cookie" | "preferredLanguage" | "baseLocale">} */ ([
    "url",
    "cookie",
    "preferredLanguage",
    "baseLocale",
  ]);

const localizedPattern = (pattern, prefixedPattern) =>
  settings.locales
    .toSorted(
      (left, right) =>
        Number(left === settings.baseLocale) -
        Number(right === settings.baseLocale),
    )
    .map(
      (locale) =>
        /** @type {[string, string]} */ ([
          locale,
          locale === settings.baseLocale
            ? pattern
            : `/${locale}${prefixedPattern}`,
        ]),
    );

export const localeUrlPatterns = [
  {
    pattern: "/",
    localized: localizedPattern("/", ""),
  },
  {
    pattern: "/:path(.*)?",
    localized: localizedPattern("/:path(.*)?", "/:path(.*)?"),
  },
];

const localizedPagePaths = [
  "/",
  "/tools{/:path(.*)}?",
  "/privacy",
  "/api",
  "/mcp",
  "/terms",
];

export const localeRouteStrategies = [
  ...localizedPagePaths.map((match) => ({ match, strategy: localeStrategy })),
  ...settings.locales
    .filter((locale) => locale !== settings.baseLocale)
    .map((locale) => ({
      match: `/${locale}{/:path(.*)}?`,
      strategy: localeStrategy,
    })),
  { match: "/:path(.*)?", exclude: /** @type {const} */ (true) },
];

export const localeTrailingSlash = "never";
