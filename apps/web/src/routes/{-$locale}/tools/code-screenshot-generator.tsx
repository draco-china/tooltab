import { createFileRoute } from "@tanstack/react-router";
import CodePage from "@/features/tools/code-screenshot-generator/page";
import { codeScreenshotGeneratorHead } from "@/features/tools/code-screenshot-generator/head";

import { CodeScreenshotRouteSkeleton } from "@/features/tools/code-screenshot-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/code-screenshot-generator",
)({
  head: codeScreenshotGeneratorHead,
  pendingComponent: CodeScreenshotRouteSkeleton,
  component: CodePage,
});
