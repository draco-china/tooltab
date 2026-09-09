import { createFileRoute } from "@tanstack/react-router";
import PgpKeyGenerator from "@/features/tools/pgp-key-generator/page";
import { pgpKeyGeneratorHead } from "@/features/tools/pgp-key-generator/head";

import { PgpKeyGeneratorSkeleton } from "@/features/tools/pgp-key-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pgp-key-generator")({
  head: pgpKeyGeneratorHead,
  pendingComponent: PgpKeyGeneratorSkeleton,
  component: PgpKeyGenerator,
});
