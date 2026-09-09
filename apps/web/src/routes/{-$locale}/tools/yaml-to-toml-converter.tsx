import { createFileRoute } from "@tanstack/react-router";
import { YamlToToml } from "@/features/tools/structured-formats/conversion-page";
import { yamlToTomlConverterHead } from "@/features/tools/structured-formats/head";

import { YamlToTomlRouteSkeleton } from "@/features/tools/yaml-to-toml-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/yaml-to-toml-converter",
)({
  head: yamlToTomlConverterHead,
  pendingComponent: YamlToTomlRouteSkeleton,
  component: YamlToToml,
});
