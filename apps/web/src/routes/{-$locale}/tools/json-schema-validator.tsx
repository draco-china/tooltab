import { createFileRoute } from "@tanstack/react-router";
import { JsonSchemaValidatorPage } from "@/features/tools/json-schema-validator/page";
import { jsonSchemaValidatorHead } from "@/features/tools/json-schema-validator/head";

import { JsonSchemaValidatorRouteSkeleton } from "@/features/tools/json-schema-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/json-schema-validator")(
  {
    head: jsonSchemaValidatorHead,
    pendingComponent: JsonSchemaValidatorRouteSkeleton,
    component: JsonSchemaValidatorPage,
  },
);
