import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const cookieParserHead = seo(
  m["shared.basicAuth.httptCookieName"],
  m["shared.basicAuth.httptCookieDescription"],
);
