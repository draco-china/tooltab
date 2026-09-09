import { createFileRoute } from "@tanstack/react-router";
import CertificatePublicKeyParserPage from "@/features/tools/certificate-public-key-parser/page";
import { certificatePublicKeyParserHead } from "@/features/tools/certificate-public-key-parser/head";

import { CertificatePublicKeyParserSkeleton } from "@/features/tools/certificate-public-key-parser/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/certificate-public-key-parser",
)({
  head: certificatePublicKeyParserHead,
  pendingComponent: CertificatePublicKeyParserSkeleton,
  component: CertificatePublicKeyParserPage,
});
