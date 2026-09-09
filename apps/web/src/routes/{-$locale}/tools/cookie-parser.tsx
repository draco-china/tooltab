import { createFileRoute } from "@tanstack/react-router";
import CookieParserPage from "@/features/tools/cookie-parser/page";
import { cookieParserHead } from "@/features/tools/cookie-parser/head";

import { CookieParserRouteSkeleton } from "@/features/tools/cookie-parser/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/cookie-parser")({
  head: cookieParserHead,
  pendingComponent: CookieParserRouteSkeleton,
  component: CookieParserPage,
});
