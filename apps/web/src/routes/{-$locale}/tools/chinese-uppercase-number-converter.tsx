import { createFileRoute } from "@tanstack/react-router";
import ChineseUppercaseNumberConverterPage from "@/features/tools/chinese-uppercase-number-converter/page";
import { chineseUppercaseNumberConverterHead } from "@/features/tools/chinese-uppercase-number-converter/head";

import { ChineseUppercaseNumberConverterSkeleton } from "@/features/tools/chinese-uppercase-number-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/chinese-uppercase-number-converter",
)({
  head: chineseUppercaseNumberConverterHead,
  pendingComponent: ChineseUppercaseNumberConverterSkeleton,
  component: ChineseUppercaseNumberConverterPage,
});
