import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { useNitroHooks as nitroHooks } from "nitro/app";
import { closeServiceRuntime } from "./features/api/runtime/http";
import { canonicalLocaleRedirect } from "./lib/locale-path";
import { paraglideMiddleware } from "./paraglide/server.js";

nitroHooks().hook("close", closeServiceRuntime);

export default createServerEntry({
  fetch(request, options) {
    if (request.method === "GET" || request.method === "HEAD") {
      const canonicalUrl = canonicalLocaleRedirect(request.url);
      if (canonicalUrl) return Response.redirect(canonicalUrl, 301);
    }
    // Routes already contain the locale segment; keep the original URL.
    return paraglideMiddleware(request, () => handler.fetch(request, options));
  },
});
