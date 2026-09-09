import { createFileRoute } from "@tanstack/react-router";
import SriHashGeneratorTool from "@/features/tools/sri-hash-generator/page";
import { sriHashGeneratorHead } from "@/features/tools/sri-hash-generator/head";

import { SriHashGeneratorSkeleton } from "@/features/tools/sri-hash-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/sri-hash-generator")({
  head: sriHashGeneratorHead,
  pendingComponent: SriHashGeneratorSkeleton,
  component: SriHashGeneratorTool,
});
