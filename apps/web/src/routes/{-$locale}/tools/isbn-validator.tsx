import { createFileRoute } from "@tanstack/react-router";
import IsbnValidatorPage from "@/features/tools/isbn-validator/page";
import { isbnValidatorHead } from "@/features/tools/isbn-validator/head";

import { IsbnValidatorRouteSkeleton } from "@/features/tools/isbn-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/isbn-validator")({
  head: isbnValidatorHead,
  pendingComponent: IsbnValidatorRouteSkeleton,
  component: IsbnValidatorPage,
});
