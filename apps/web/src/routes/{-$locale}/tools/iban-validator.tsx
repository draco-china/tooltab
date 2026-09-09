import { createFileRoute } from "@tanstack/react-router";
import { IbanValidatorPage } from "@/features/tools/iban-validator/page";
import { ibanValidatorHead } from "@/features/tools/iban-validator/head";

import { IbanValidatorRouteSkeleton } from "@/features/tools/iban-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/iban-validator")({
  head: ibanValidatorHead,
  pendingComponent: IbanValidatorRouteSkeleton,
  component: IbanValidatorPage,
});
