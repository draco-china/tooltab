import { createFileRoute } from "@tanstack/react-router";
import JwkPemTool from "@/features/tools/jwk-pem-converter/page";
import { jwkPemConverterHead } from "@/features/tools/jwk-pem-converter/head";

import { JwkPemConverterSkeleton } from "@/features/tools/jwk-pem-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/jwk-pem-converter")({
  head: jwkPemConverterHead,
  pendingComponent: JwkPemConverterSkeleton,
  component: JwkPemTool,
});
