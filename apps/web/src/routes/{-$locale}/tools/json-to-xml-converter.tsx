import { createFileRoute } from "@tanstack/react-router";
import { JsonToXml } from "@/features/tools/json-to-xml-converter/page";
import { jsonToXmlConverterHead } from "@/features/tools/json-to-xml-converter/head";

import { JsonToXmlConverterSkeleton } from "@/features/tools/json-to-xml-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/json-to-xml-converter")(
  {
    head: jsonToXmlConverterHead,
    pendingComponent: JsonToXmlConverterSkeleton,
    component: JsonToXml,
  },
);
