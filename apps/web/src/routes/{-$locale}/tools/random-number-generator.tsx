import { createFileRoute } from "@tanstack/react-router";
import RandomNumberGenerator from "@/features/tools/random-number-generator/page";
import { randomNumberGeneratorHead } from "@/features/tools/random-number-generator/head";

import { RandomNumberGeneratorSkeleton } from "@/features/tools/random-number-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/random-number-generator",
)({
  head: randomNumberGeneratorHead,
  pendingComponent: RandomNumberGeneratorSkeleton,
  component: RandomNumberGenerator,
});
