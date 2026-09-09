import { createFileRoute } from "@tanstack/react-router";
import BarcodeReaderPage from "@/features/tools/barcode/reader-page";
import { barcodeReaderHead } from "@/features/tools/barcode/head";

import { BarcodeReaderRouteSkeleton } from "@/features/tools/barcode/reader-skeleton";

export const Route = createFileRoute("/{-$locale}/tools/barcode-reader")({
  head: barcodeReaderHead,
  pendingComponent: BarcodeReaderRouteSkeleton,
  component: BarcodeReaderPage,
});
