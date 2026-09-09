import { createFileRoute } from "@tanstack/react-router";
import IPv6UlaGenerator from "@/features/tools/ipv6-ula-generator/page";
import { ipv6UlaGeneratorHead } from "@/features/tools/ipv6-ula-generator/head";

import { IPv6UlaGeneratorSkeleton } from "@/features/tools/ipv6-ula-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ipv6-ula-generator")({
  head: ipv6UlaGeneratorHead,
  pendingComponent: IPv6UlaGeneratorSkeleton,
  component: IPv6UlaGenerator,
});
