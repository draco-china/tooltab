import { createFileRoute } from "@tanstack/react-router";
import DataUriToFile from "@/features/tools/data-uri-to-file-converter/page";
import { dataUriToFileConverterHead } from "@/features/tools/data-uri-to-file-converter/head";

import { DataUriToFileRouteSkeleton } from "@/features/tools/data-uri-to-file-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/data-uri-to-file-converter",
)({
  head: dataUriToFileConverterHead,
  pendingComponent: DataUriToFileRouteSkeleton,
  component: DataUriToFile,
});
