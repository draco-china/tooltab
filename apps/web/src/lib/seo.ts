import type { MessageFunction } from "@/lib/message-keys";
import { m } from "@/paraglide/messages.js";
import {
  baseLocale,
  deLocalizeUrl,
  getLocale,
  locales,
} from "@/paraglide/runtime.js";
import { localePath } from "./locale-path";
import { siteOrigin } from "./site-origin";
export function seo(
  titleMessage: MessageFunction = m["navigation.tagline"],
  descriptionMessage: MessageFunction = m["home.intro"],
) {
  return ({ match }: { match: { pathname: string } }) => {
    const locale = getLocale();
    const origin = siteOrigin();
    const pathname = deLocalizeUrl(new URL(match.pathname, origin)).pathname;
    const path = pathname === "/" ? "" : pathname.replace(/\/$/, "");
    const title = `${titleMessage({}, { locale })} · ToolTab`,
      description = descriptionMessage({}, { locale }),
      url = `${origin}${localePath(locale, path)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [
        { rel: "canonical", href: url },
        ...locales.map((l) => ({
          rel: "alternate",
          hrefLang: l,
          href: `${origin}${localePath(l, path)}`,
        })),
        {
          rel: "alternate",
          hrefLang: "x-default",
          href: `${origin}${localePath(baseLocale, path)}`,
        },
      ],
    };
  };
}
