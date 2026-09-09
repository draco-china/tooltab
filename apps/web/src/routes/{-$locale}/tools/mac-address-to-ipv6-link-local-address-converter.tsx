import { createFileRoute } from "@tanstack/react-router";
import MacToIpv6LinkLocalPage from "@/features/tools/mac-address-to-ipv6-link-local-address-converter/page";
import { macAddressToIpv6LinkLocalAddressConverterHead } from "@/features/tools/mac-address-to-ipv6-link-local-address-converter/head";

import { MacToIpv6Skeleton } from "@/features/tools/mac-address-to-ipv6-link-local-address-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/mac-address-to-ipv6-link-local-address-converter",
)({
  head: macAddressToIpv6LinkLocalAddressConverterHead,
  pendingComponent: MacToIpv6Skeleton,
  component: MacToIpv6LinkLocalPage,
});
