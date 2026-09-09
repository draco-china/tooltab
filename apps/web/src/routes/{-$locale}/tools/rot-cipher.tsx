import { createFileRoute } from "@tanstack/react-router";
import RotCipher from "@/features/tools/rot-cipher/page";
import { rotCipherHead } from "@/features/tools/rot-cipher/head";

import { RotCipherSkeleton } from "@/features/tools/rot-cipher/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/rot-cipher")({
  head: rotCipherHead,
  pendingComponent: RotCipherSkeleton,
  component: RotCipher,
});
