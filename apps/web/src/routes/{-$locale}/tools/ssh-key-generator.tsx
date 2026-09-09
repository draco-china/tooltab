import { createFileRoute } from "@tanstack/react-router";
import SshKeyGeneratorPage from "@/features/tools/ssh/generator-page";
import { sshKeyGeneratorHead } from "@/features/tools/ssh/head";

import { SshKeyGeneratorRouteSkeleton } from "@/features/tools/ssh/generator-skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ssh-key-generator")({
  head: sshKeyGeneratorHead,
  pendingComponent: SshKeyGeneratorRouteSkeleton,
  component: SshKeyGeneratorPage,
});
