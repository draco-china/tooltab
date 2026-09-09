import { createFileRoute } from "@tanstack/react-router";
import { SshPublicKeyFingerprint } from "@/features/tools/ssh-public-key-fingerprint/page";
import { sshPublicKeyFingerprintHead } from "@/features/tools/ssh-public-key-fingerprint/head";

import { SshPublicKeyFingerprintSkeleton } from "@/features/tools/ssh-public-key-fingerprint/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ssh-public-key-fingerprint",
)({
  head: sshPublicKeyFingerprintHead,
  pendingComponent: SshPublicKeyFingerprintSkeleton,
  component: SshPublicKeyFingerprint,
});
