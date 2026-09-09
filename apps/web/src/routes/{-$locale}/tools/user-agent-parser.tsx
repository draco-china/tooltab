import { createFileRoute } from "@tanstack/react-router";
import { UserAgentParser } from "@/features/tools/user-agent-parser/page";
import { userAgentParserHead } from "@/features/tools/user-agent-parser/head";

import { UserAgentParserSkeleton } from "@/features/tools/user-agent-parser/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/user-agent-parser")({
  head: userAgentParserHead,
  pendingComponent: UserAgentParserSkeleton,
  component: UserAgentParser,
});
