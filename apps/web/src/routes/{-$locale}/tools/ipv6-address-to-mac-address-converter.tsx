import { createFileRoute } from "@tanstack/react-router";
import { Ipv6ToMacPage } from "@/features/tools/ipv6-address-to-mac-address-converter/page";
import { ipv6AddressToMacAddressConverterHead } from "@/features/tools/ipv6-address-to-mac-address-converter/head";

import { Ipv6ToMacSkeleton } from "@/features/tools/ipv6-address-to-mac-address-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ipv6-address-to-mac-address-converter",
)({
  head: ipv6AddressToMacAddressConverterHead,
  pendingComponent: Ipv6ToMacSkeleton,
  component: Ipv6ToMacPage,
});
