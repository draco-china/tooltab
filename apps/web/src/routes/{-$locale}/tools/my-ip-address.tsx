import { createFileRoute } from "@tanstack/react-router";
import MyIpAddress from "@/features/tools/my-ip-address/page";
import { myIpAddressHead } from "@/features/tools/my-ip-address/head";

import { MyIpAddressSkeleton } from "@/features/tools/my-ip-address/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/my-ip-address")({
  head: myIpAddressHead,
  pendingComponent: MyIpAddressSkeleton,
  component: MyIpAddress,
});
