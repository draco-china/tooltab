import { createFileRoute } from "@tanstack/react-router";
import { DeviceInformation } from "@/features/tools/device-information/page";
import { deviceInformationHead } from "@/features/tools/device-information/head";

import { DeviceInformationRouteSkeleton } from "@/features/tools/device-information/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/device-information")({
  head: deviceInformationHead,
  pendingComponent: DeviceInformationRouteSkeleton,
  component: DeviceInformation,
});
