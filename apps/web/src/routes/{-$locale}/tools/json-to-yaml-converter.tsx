import { createFileRoute } from "@tanstack/react-router";
import { JsonToYaml } from "@/features/tools/json-to-yaml-converter/page";
import { jsonToYamlConverterHead } from "@/features/tools/json-to-yaml-converter/head";

import { JsonToYamlConverterSkeleton } from "@/features/tools/json-to-yaml-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/json-to-yaml-converter",
)({
  head: jsonToYamlConverterHead,
  pendingComponent: JsonToYamlConverterSkeleton,
  component: JsonToYaml,
});
