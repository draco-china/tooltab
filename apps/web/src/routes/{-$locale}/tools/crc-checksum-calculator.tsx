import { createFileRoute } from "@tanstack/react-router";
import CrcChecksumCalculatorPage from "@/features/tools/crc-checksum-calculator/page";
import { crcChecksumCalculatorHead } from "@/features/tools/crc-checksum-calculator/head";

import { CrcChecksumCalculatorRouteSkeleton } from "@/features/tools/crc-checksum-calculator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/crc-checksum-calculator",
)({
  head: crcChecksumCalculatorHead,
  pendingComponent: CrcChecksumCalculatorRouteSkeleton,
  component: CrcChecksumCalculatorPage,
});
