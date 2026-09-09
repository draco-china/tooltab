import { createFileRoute } from "@tanstack/react-router";
import BcryptHashPasswordVerifierPage from "@/features/tools/bcrypt/verifier-page";
import { bcryptHashPasswordVerifierHead } from "@/features/tools/bcrypt/head";

import { BcryptHashPasswordVerifierRouteSkeleton } from "@/features/tools/bcrypt/verifier-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/bcrypt-hash-password-verifier",
)({
  head: bcryptHashPasswordVerifierHead,
  pendingComponent: BcryptHashPasswordVerifierRouteSkeleton,
  component: BcryptHashPasswordVerifierPage,
});
