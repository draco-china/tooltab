import { createFileRoute } from "@tanstack/react-router";
import CurlConverter from "@/features/tools/curl-converter/page";
import { curlConverterHead } from "@/features/tools/curl-converter/head";

import { CurlConverterRouteSkeleton } from "@/features/tools/curl-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/curl-converter")({
  head: curlConverterHead,
  pendingComponent: CurlConverterRouteSkeleton,
  component: CurlConverter,
});
