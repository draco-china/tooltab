import { createFileRoute } from "@tanstack/react-router";
import Argon2HashPasswordVerifierPage from "@/features/tools/argon2/verifier-page";
import { argon2HashPasswordVerifierHead } from "@/features/tools/argon2/head";

import { Argon2HashPasswordVerifierSkeleton } from "@/features/tools/argon2/verifier-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/argon2-hash-password-verifier",
)({
  head: argon2HashPasswordVerifierHead,
  pendingComponent: Argon2HashPasswordVerifierSkeleton,
  component: Argon2HashPasswordVerifierPage,
});
