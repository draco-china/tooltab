import { createFileRoute } from "@tanstack/react-router";
import UnicodeInvisibleCharacterCheckerPage from "@/features/tools/unicode-invisible-character-checker/page";
import { unicodeInvisibleCharacterCheckerHead } from "@/features/tools/unicode-invisible-character-checker/head";

import { UnicodeInvisibleCharacterCheckerRouteSkeleton } from "@/features/tools/unicode-invisible-character-checker/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/unicode-invisible-character-checker",
)({
  head: unicodeInvisibleCharacterCheckerHead,
  pendingComponent: UnicodeInvisibleCharacterCheckerRouteSkeleton,
  component: UnicodeInvisibleCharacterCheckerPage,
});
