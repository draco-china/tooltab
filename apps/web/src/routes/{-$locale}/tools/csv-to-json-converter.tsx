import { createFileRoute } from "@tanstack/react-router";
import CsvToJsonConverterPage from "@/features/tools/csv-to-json-converter/page";
import { csvToJsonConverterHead } from "@/features/tools/csv-to-json-converter/head";

import { CsvToJsonConverterSkeleton } from "@/features/tools/csv-to-json-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/csv-to-json-converter")(
  {
    head: csvToJsonConverterHead,
    pendingComponent: CsvToJsonConverterSkeleton,
    component: CsvToJsonConverterPage,
  },
);
