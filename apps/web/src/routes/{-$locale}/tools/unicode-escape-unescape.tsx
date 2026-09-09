import { createFileRoute } from "@tanstack/react-router";
import UnicodeEscapeUnescape from "@/features/tools/unicode-escape-unescape/page";
import { unicodeEscapeUnescapeHead } from "@/features/tools/unicode-escape-unescape/head";

import { UnicodeEscapeUnescapeSkeleton } from "@/features/tools/unicode-escape-unescape/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/unicode-escape-unescape",
)({
  head: unicodeEscapeUnescapeHead,
  pendingComponent: UnicodeEscapeUnescapeSkeleton,
  component: UnicodeEscapeUnescape,
});
