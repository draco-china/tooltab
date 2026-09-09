import { createFileRoute } from "@tanstack/react-router";
import { UuidConverterRouteSkeleton } from "@/features/tools/uuid-base64-hex-decimal-octal-binary-converter/skeleton";
import { UuidConverter } from "@/features/tools/uuid-inspector/page";
import { uuidBase64HexDecimalOctalBinaryConverterHead } from "@/features/tools/uuid-inspector/head";

export const Route = createFileRoute(
  "/{-$locale}/tools/uuid-base64-hex-decimal-octal-binary-converter",
)({
  head: uuidBase64HexDecimalOctalBinaryConverterHead,
  pendingComponent: UuidConverterRouteSkeleton,
  component: UuidConverter,
});
