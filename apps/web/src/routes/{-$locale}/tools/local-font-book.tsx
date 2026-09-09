import { createFileRoute } from "@tanstack/react-router";
import LocalFontBook from "@/features/tools/local-font-book/page";
import { localFontBookHead } from "@/features/tools/local-font-book/head";

import { LocalFontBookSkeleton } from "@/features/tools/local-font-book/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/local-font-book")({
  head: localFontBookHead,
  pendingComponent: LocalFontBookSkeleton,
  component: LocalFontBook,
});
