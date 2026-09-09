import { createFileRoute } from "@tanstack/react-router";
import { TomlToJson } from "@/features/tools/toml-to-json-converter/page";
import { tomlToJsonConverterHead } from "@/features/tools/toml-to-json-converter/head";

import { TomlToJsonRouteSkeleton } from "@/features/tools/toml-to-json-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/toml-to-json-converter",
)({
  head: tomlToJsonConverterHead,
  pendingComponent: TomlToJsonRouteSkeleton,
  component: TomlToJson,
});
