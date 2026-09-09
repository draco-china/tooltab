import { createFileRoute } from "@tanstack/react-router";
import XmlToJsonPage from "@/features/tools/xml-to-json-converter/page";
import { xmlToJsonConverterHead } from "@/features/tools/xml-to-json-converter/head";

import { XmlToJsonConverterSkeleton } from "@/features/tools/xml-to-json-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/xml-to-json-converter")(
  {
    head: xmlToJsonConverterHead,
    pendingComponent: XmlToJsonConverterSkeleton,
    component: XmlToJsonPage,
  },
);
