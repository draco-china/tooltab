import { createFileRoute } from "@tanstack/react-router";
import PrettierFormatterPage from "@/features/tools/prettier-code-formatter/page";
import { prettierCodeFormatterHead } from "@/features/tools/prettier-code-formatter/head";

import { PrettierCodeFormatterSkeleton } from "@/features/tools/prettier-code-formatter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/prettier-code-formatter",
)({
  head: prettierCodeFormatterHead,
  pendingComponent: PrettierCodeFormatterSkeleton,
  component: PrettierFormatterPage,
});
