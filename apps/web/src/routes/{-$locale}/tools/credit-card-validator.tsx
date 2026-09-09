import { createFileRoute } from "@tanstack/react-router";
import CreditCardValidatorPage from "@/features/tools/credit-card-validator/page";
import { creditCardValidatorHead } from "@/features/tools/credit-card-validator/head";

import { CreditCardValidatorRouteSkeleton } from "@/features/tools/credit-card-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/credit-card-validator")(
  {
    head: creditCardValidatorHead,
    pendingComponent: CreditCardValidatorRouteSkeleton,
    component: CreditCardValidatorPage,
  },
);
