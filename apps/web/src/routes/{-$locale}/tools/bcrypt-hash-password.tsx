import { createFileRoute } from "@tanstack/react-router";
import BcryptHashPasswordPage from "@/features/tools/bcrypt/generator-page";
import { bcryptHashPasswordHead } from "@/features/tools/bcrypt/head";

import { BcryptHashPasswordRouteSkeleton } from "@/features/tools/bcrypt/generator-skeleton";

export const Route = createFileRoute("/{-$locale}/tools/bcrypt-hash-password")({
  head: bcryptHashPasswordHead,
  pendingComponent: BcryptHashPasswordRouteSkeleton,
  component: BcryptHashPasswordPage,
});
