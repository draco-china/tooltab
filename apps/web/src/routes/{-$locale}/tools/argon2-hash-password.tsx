import { createFileRoute } from "@tanstack/react-router";
import Argon2HashPasswordPage from "@/features/tools/argon2/hash-page";
import { argon2HashPasswordHead } from "@/features/tools/argon2/head";

import { Argon2HashPasswordSkeleton } from "@/features/tools/argon2/hash-skeleton";

export const Route = createFileRoute("/{-$locale}/tools/argon2-hash-password")({
  head: argon2HashPasswordHead,
  pendingComponent: Argon2HashPasswordSkeleton,
  component: Argon2HashPasswordPage,
});
