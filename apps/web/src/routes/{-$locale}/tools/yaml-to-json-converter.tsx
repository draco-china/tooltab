import { createFileRoute } from "@tanstack/react-router";
import { YamlToJson } from "@/features/tools/structured-formats/conversion-page";
import { yamlToJsonConverterHead } from "@/features/tools/structured-formats/head";

import { YamlToJsonRouteSkeleton } from "@/features/tools/yaml-to-json-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/yaml-to-json-converter",
)({
  head: yamlToJsonConverterHead,
  pendingComponent: YamlToJsonRouteSkeleton,
  component: YamlToJson,
});
