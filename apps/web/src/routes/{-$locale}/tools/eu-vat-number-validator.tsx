import { createFileRoute } from "@tanstack/react-router";
import VatValidator from "@/features/tools/eu-vat-number-validator/page";
import { euVatNumberValidatorHead } from "@/features/tools/eu-vat-number-validator/head";

import { VatValidatorRouteSkeleton } from "@/features/tools/eu-vat-number-validator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/eu-vat-number-validator",
)({
  head: euVatNumberValidatorHead,
  pendingComponent: VatValidatorRouteSkeleton,
  component: VatValidator,
});
