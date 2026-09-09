import { createFileRoute } from "@tanstack/react-router";
import RomanNumeralConverter from "@/features/tools/roman-numeral-converter/page";
import { romanNumeralConverterHead } from "@/features/tools/roman-numeral-converter/head";

import { RomanNumeralConverterSkeleton } from "@/features/tools/roman-numeral-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/roman-numeral-converter",
)({
  head: romanNumeralConverterHead,
  pendingComponent: RomanNumeralConverterSkeleton,
  component: RomanNumeralConverter,
});
