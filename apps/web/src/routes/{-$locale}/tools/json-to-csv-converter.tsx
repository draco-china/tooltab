import { createFileRoute } from "@tanstack/react-router";
import { JsonToCsvConverterTool } from "@/features/tools/json-to-csv-converter/page";
import { jsonToCsvConverterHead } from "@/features/tools/json-to-csv-converter/head";

import { JsonToCsvConverterSkeleton } from "@/features/tools/json-to-csv-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/json-to-csv-converter")(
  {
    head: jsonToCsvConverterHead,
    pendingComponent: JsonToCsvConverterSkeleton,
    component: JsonToCsvConverterTool,
  },
);
