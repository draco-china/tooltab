import { createFileRoute } from "@tanstack/react-router";
import CidrParserPage from "@/features/tools/cidr-parser/page";
import { cidrParserHead } from "@/features/tools/cidr-parser/head";

import { CidrParserSkeleton } from "@/features/tools/cidr-parser/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/cidr-parser")({
  head: cidrParserHead,
  pendingComponent: CidrParserSkeleton,
  component: CidrParserPage,
});
