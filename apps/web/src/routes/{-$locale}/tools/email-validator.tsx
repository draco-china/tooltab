import { createFileRoute } from "@tanstack/react-router";
import EmailValidator from "@/features/tools/email-validator/page";
import { emailValidatorHead } from "@/features/tools/email-validator/head";

import { EmailValidatorRouteSkeleton } from "@/features/tools/email-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/email-validator")({
  head: emailValidatorHead,
  pendingComponent: EmailValidatorRouteSkeleton,
  component: EmailValidator,
});
