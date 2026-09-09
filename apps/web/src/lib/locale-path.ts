import { baseLocale, isLocale, type Locale } from "@/paraglide/runtime.js";

export function localePath(locale: Locale, path = "") {
  const suffix = path === "/" ? "" : path;
  return locale === baseLocale ? suffix || "/" : `/${locale}${suffix}`;
}

export function localeFromRouteParam(locale: string | undefined): Locale {
  return isLocale(locale) ? locale : baseLocale;
}

export function canonicalLocalePathname(pathname: string) {
  const [firstSegment] = pathname.slice(1).split("/", 1);
  if (!isLocale(firstSegment) || firstSegment !== baseLocale) return null;

  const withoutLocale = pathname.slice(`/${baseLocale}`.length) || "/";
  if (withoutLocale === "/") return "/";
  return withoutLocale.endsWith("/")
    ? withoutLocale.slice(0, -1)
    : withoutLocale;
}

export function canonicalLocaleRedirect(requestUrl: string) {
  const url = new URL(requestUrl);
  const pathname = canonicalLocalePathname(url.pathname);
  if (pathname === null) return null;
  url.pathname = pathname;
  return url;
}
