import { createFileRoute } from "@tanstack/react-router";
import { JsonPathTesterPage } from "@/features/tools/jsonpath-tester/page";
import { jsonpathTesterHead } from "@/features/tools/jsonpath-tester/head";

import { JsonPathTesterSkeleton } from "@/features/tools/jsonpath-tester/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/jsonpath-tester")({
  head: jsonpathTesterHead,
  pendingComponent: JsonPathTesterSkeleton,
  component: JsonPathTesterPage,
});
