import { createFileRoute } from "@tanstack/react-router";
import RobotsTxtGenerator from "@/features/tools/robots-txt-generator/page";
import { robotsTxtGeneratorHead } from "@/features/tools/robots-txt-generator/head";

import { RobotsTxtGeneratorSkeleton } from "@/features/tools/robots-txt-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/robots-txt-generator")({
  head: robotsTxtGeneratorHead,
  pendingComponent: RobotsTxtGeneratorSkeleton,
  component: RobotsTxtGenerator,
});
