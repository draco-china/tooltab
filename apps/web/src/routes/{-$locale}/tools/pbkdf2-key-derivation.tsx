import { createFileRoute } from "@tanstack/react-router";
import Pbkdf2KeyDerivationPage from "@/features/tools/pbkdf2-key-derivation/page";
import { pbkdf2KeyDerivationHead } from "@/features/tools/pbkdf2-key-derivation/head";

import { Pbkdf2KeyDerivationSkeleton } from "@/features/tools/pbkdf2-key-derivation/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pbkdf2-key-derivation")(
  {
    head: pbkdf2KeyDerivationHead,
    pendingComponent: Pbkdf2KeyDerivationSkeleton,
    component: Pbkdf2KeyDerivationPage,
  },
);
