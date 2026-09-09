import { createFileRoute } from "@tanstack/react-router";
import { QrReader } from "@/features/tools/qr-code-reader/page";
import { qrCodeReaderHead } from "@/features/tools/qr-code-reader/head";

import { QrCodeReaderSkeleton } from "@/features/tools/qr-code-reader/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/qr-code-reader")({
  head: qrCodeReaderHead,
  pendingComponent: QrCodeReaderSkeleton,
  component: QrReader,
});
