import { createFileRoute } from "@tanstack/react-router";
import { OpenapiToTypescriptConverter } from "@/features/tools/openapi-to-typescript-converter/page";
import { openapiToTypescriptConverterHead } from "@/features/tools/openapi-to-typescript-converter/head";

import { OpenapiToTypescriptConverterSkeleton } from "@/features/tools/openapi-to-typescript-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/openapi-to-typescript-converter",
)({
  head: openapiToTypescriptConverterHead,
  pendingComponent: OpenapiToTypescriptConverterSkeleton,
  component: OpenapiToTypescriptConverter,
});
