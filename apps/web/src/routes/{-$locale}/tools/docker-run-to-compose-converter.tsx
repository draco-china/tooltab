import { createFileRoute } from "@tanstack/react-router";
import { DockerRunToComposePage } from "@/features/tools/docker-run-to-compose-converter/page";
import { dockerRunToComposeConverterHead } from "@/features/tools/docker-run-to-compose-converter/head";

import { DockerRunRouteSkeleton } from "@/features/tools/docker-run-to-compose-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/docker-run-to-compose-converter",
)({
  head: dockerRunToComposeConverterHead,
  pendingComponent: DockerRunRouteSkeleton,
  component: DockerRunToComposePage,
});
