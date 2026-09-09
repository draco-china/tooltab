import { createFileRoute } from "@tanstack/react-router";
import RegexTesterReplacerPage from "@/features/tools/regex-tester-replacer/page";
import { regexTesterReplacerHead } from "@/features/tools/regex-tester-replacer/head";

import { RegexTesterReplacerSkeleton } from "@/features/tools/regex-tester-replacer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/regex-tester-replacer")(
  {
    head: regexTesterReplacerHead,
    pendingComponent: RegexTesterReplacerSkeleton,
    component: RegexTesterReplacerPage,
  },
);
