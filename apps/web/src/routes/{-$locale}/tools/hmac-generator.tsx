import { createFileRoute } from "@tanstack/react-router";
import { HmacGenerator } from "@/features/tools/hmac-generator/page";
import { hmacGeneratorHead } from "@/features/tools/hmac-generator/head";

import { HmacGeneratorSkeleton } from "@/features/tools/hmac-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/hmac-generator")({
  head: hmacGeneratorHead,
  pendingComponent: HmacGeneratorSkeleton,
  component: HmacGenerator,
});
