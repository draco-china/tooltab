import { createFileRoute } from "@tanstack/react-router";
import { PunycodeConverter } from "@/features/tools/unicode-punycode-converter/page";
import { unicodePunycodeConverterHead } from "@/features/tools/unicode-punycode-converter/head";

import { UnicodePunycodeSkeleton } from "@/features/tools/unicode-punycode-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/unicode-punycode-converter",
)({
  head: unicodePunycodeConverterHead,
  pendingComponent: UnicodePunycodeSkeleton,
  component: PunycodeConverter,
});
