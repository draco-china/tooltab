import { createFileRoute } from "@tanstack/react-router";
import QrGenerator from "@/features/tools/qr-code-generator/page";
import { qrCodeGeneratorHead } from "@/features/tools/qr-code-generator/head";

import { QrCodeGeneratorSkeleton } from "@/features/tools/qr-code-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/qr-code-generator")({
  head: qrCodeGeneratorHead,
  pendingComponent: QrCodeGeneratorSkeleton,
  component: QrGenerator,
});
