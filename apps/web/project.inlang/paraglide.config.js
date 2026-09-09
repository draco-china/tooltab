import { defineConfig } from "@inlang/paraglide-js";
import {
  localeRouteStrategies,
  localeStrategy,
  localeTrailingSlash,
  localeUrlPatterns,
} from "./routing.js";

export default defineConfig({
  strategy: localeStrategy,
  cookieName: "tooltab-locale",
  cookieMaxAge: 31536000,
  routeStrategies: localeRouteStrategies,
  trailingSlash: localeTrailingSlash,
  urlPatterns: localeUrlPatterns,
});
