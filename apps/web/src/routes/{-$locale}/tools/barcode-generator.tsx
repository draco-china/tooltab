import { createFileRoute } from "@tanstack/react-router";
import BarcodeGeneratorPage from "@/features/tools/barcode/generator-page";
import { barcodeGeneratorHead } from "@/features/tools/barcode/head";

import { BarcodeGeneratorSkeleton } from "@/features/tools/barcode/generator-skeleton";

export const Route = createFileRoute("/{-$locale}/tools/barcode-generator")({
  head: barcodeGeneratorHead,
  pendingComponent: BarcodeGeneratorSkeleton,
  component: BarcodeGeneratorPage,
});
