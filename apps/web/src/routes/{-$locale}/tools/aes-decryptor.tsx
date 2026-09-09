import { createFileRoute } from "@tanstack/react-router";
import { AesDecryptor } from "@/features/tools/aes-tools/page";
import { aesDecryptorHead } from "@/features/tools/aes-tools/head";

import { AesToolSkeleton } from "@/features/tools/aes-tools/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/aes-decryptor")({
  head: aesDecryptorHead,
  pendingComponent: AesToolSkeleton,
  component: AesDecryptor,
});
