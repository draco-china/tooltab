import { createFileRoute } from "@tanstack/react-router";
import { JsonSchemaGeneratorPage } from "@/features/tools/json-schema-generator/page";
import { jsonSchemaGeneratorHead } from "@/features/tools/json-schema-generator/head";

import { JsonSchemaGeneratorRouteSkeleton } from "@/features/tools/json-schema-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/json-schema-generator")(
  {
    head: jsonSchemaGeneratorHead,
    pendingComponent: JsonSchemaGeneratorRouteSkeleton,
    component: JsonSchemaGeneratorPage,
  },
);
