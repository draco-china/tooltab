import { createFileRoute } from "@tanstack/react-router";
import JsonFormatter from "@/features/tools/json-formatter/page";
import { jsonFormatterHead } from "@/features/tools/json-formatter/head";

import { JsonFormatterSkeleton } from "@/features/tools/json-formatter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/json-formatter")({
  head: jsonFormatterHead,
  pendingComponent: JsonFormatterSkeleton,
  component: JsonFormatter,
});
