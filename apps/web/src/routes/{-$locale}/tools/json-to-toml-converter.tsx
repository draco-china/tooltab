import { createFileRoute } from "@tanstack/react-router";
import { JsonToToml } from "@/features/tools/json-to-toml-converter/page";
import { jsonToTomlConverterHead } from "@/features/tools/json-to-toml-converter/head";

import { JsonToTomlRouteSkeleton } from "@/features/tools/json-to-toml-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/json-to-toml-converter",
)({
  head: jsonToTomlConverterHead,
  pendingComponent: JsonToTomlRouteSkeleton,
  component: JsonToToml,
});
