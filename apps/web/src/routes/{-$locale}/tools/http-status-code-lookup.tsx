import { createFileRoute } from "@tanstack/react-router";
import HttpStatusCodeLookup from "@/features/tools/http-status-code-lookup/page";
import { httpStatusCodeLookupHead } from "@/features/tools/http-status-code-lookup/head";

import { HttpStatusRouteSkeleton } from "@/features/tools/http-status-code-lookup/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/http-status-code-lookup",
)({
  head: httpStatusCodeLookupHead,
  pendingComponent: HttpStatusRouteSkeleton,
  component: HttpStatusCodeLookup,
});
