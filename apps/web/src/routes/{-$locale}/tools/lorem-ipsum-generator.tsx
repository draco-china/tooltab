import { createFileRoute } from "@tanstack/react-router";
import LoremIpsumTool from "@/features/tools/lorem-ipsum-generator/page";
import { loremIpsumGeneratorHead } from "@/features/tools/lorem-ipsum-generator/head";

import { LoremIpsumGeneratorSkeleton } from "@/features/tools/lorem-ipsum-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/lorem-ipsum-generator")(
  {
    head: loremIpsumGeneratorHead,
    pendingComponent: LoremIpsumGeneratorSkeleton,
    component: LoremIpsumTool,
  },
);
