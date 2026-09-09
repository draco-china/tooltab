import { createFileRoute } from "@tanstack/react-router";
import { AesEncryptor } from "@/features/tools/aes-tools/page";
import { aesEncryptorHead } from "@/features/tools/aes-tools/head";

import { AesToolSkeleton } from "@/features/tools/aes-tools/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/aes-encryptor")({
  head: aesEncryptorHead,
  pendingComponent: AesToolSkeleton,
  component: AesEncryptor,
});
