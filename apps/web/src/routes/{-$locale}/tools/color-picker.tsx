import { createFileRoute } from "@tanstack/react-router";
import ColorPicker from "@/features/tools/color-picker/page";
import { colorPickerHead } from "@/features/tools/color-picker/head";

import { ColorPickerRouteSkeleton } from "@/features/tools/color-picker/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/color-picker")({
  head: colorPickerHead,
  pendingComponent: ColorPickerRouteSkeleton,
  component: ColorPicker,
});
