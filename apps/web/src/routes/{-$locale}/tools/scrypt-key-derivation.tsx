import { createFileRoute } from "@tanstack/react-router";
import ScryptKeyDerivationPage from "@/features/tools/scrypt-key-derivation/page";
import { scryptKeyDerivationHead } from "@/features/tools/scrypt-key-derivation/head";

import { ScryptKeyDerivationRouteSkeleton } from "@/features/tools/scrypt-key-derivation/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/scrypt-key-derivation")(
  {
    head: scryptKeyDerivationHead,
    pendingComponent: ScryptKeyDerivationRouteSkeleton,
    component: ScryptKeyDerivationPage,
  },
);
