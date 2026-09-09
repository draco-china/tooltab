import { createFileRoute } from "@tanstack/react-router";
import { TomlToYaml } from "@/features/tools/structured-formats/conversion-page";
import { tomlToYamlConverterHead } from "@/features/tools/structured-formats/head";

import { TomlToYamlRouteSkeleton } from "@/features/tools/toml-to-yaml-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/toml-to-yaml-converter",
)({
  head: tomlToYamlConverterHead,
  pendingComponent: TomlToYamlRouteSkeleton,
  component: TomlToYaml,
});
