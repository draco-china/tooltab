import { createFileRoute } from "@tanstack/react-router";
import { JmespathTesterPage } from "@/features/tools/jmespath-tester/page";
import { jmespathTesterHead } from "@/features/tools/jmespath-tester/head";

import { JmespathTesterSkeleton } from "@/features/tools/jmespath-tester/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/jmespath-tester")({
  head: jmespathTesterHead,
  pendingComponent: JmespathTesterSkeleton,
  component: JmespathTesterPage,
});
