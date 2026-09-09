import { createFileRoute } from "@tanstack/react-router";
import FileToDataUriConverterPage from "@/features/tools/file-to-data-uri-converter/page";
import { fileToDataUriConverterHead } from "@/features/tools/file-to-data-uri-converter/head";

import { FileToDataUriConverterRouteSkeleton } from "@/features/tools/file-to-data-uri-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/file-to-data-uri-converter",
)({
  head: fileToDataUriConverterHead,
  pendingComponent: FileToDataUriConverterRouteSkeleton,
  component: FileToDataUriConverterPage,
});
