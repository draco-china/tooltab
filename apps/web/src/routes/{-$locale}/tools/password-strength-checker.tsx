import { createFileRoute } from "@tanstack/react-router";
import PasswordStrengthCheckerPage from "@/features/tools/password-strength-checker/page";
import { passwordStrengthCheckerHead } from "@/features/tools/password-strength-checker/head";

import { PasswordStrengthCheckerRouteSkeleton } from "@/features/tools/password-strength-checker/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/password-strength-checker",
)({
  head: passwordStrengthCheckerHead,
  pendingComponent: PasswordStrengthCheckerRouteSkeleton,
  component: PasswordStrengthCheckerPage,
});
