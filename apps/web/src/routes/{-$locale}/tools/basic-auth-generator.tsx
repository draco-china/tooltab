import { createFileRoute } from "@tanstack/react-router";
import BasicAuthGeneratorPage from "@/features/tools/basic-auth-generator/page";
import { basicAuthGeneratorHead } from "@/features/tools/basic-auth-generator/head";

import { BasicAuthGeneratorRouteSkeleton } from "@/features/tools/basic-auth-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/basic-auth-generator")({
  head: basicAuthGeneratorHead,
  pendingComponent: BasicAuthGeneratorRouteSkeleton,
  component: BasicAuthGeneratorPage,
});
