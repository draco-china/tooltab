import { createFileRoute } from "@tanstack/react-router";
import { SitemapGenerator } from "@/features/tools/sitemap-xml-generator/page";
import { sitemapXmlGeneratorHead } from "@/features/tools/sitemap-xml-generator/head";

import { SitemapXmlGeneratorSkeleton } from "@/features/tools/sitemap-xml-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/sitemap-xml-generator")(
  {
    head: sitemapXmlGeneratorHead,
    pendingComponent: SitemapXmlGeneratorSkeleton,
    component: SitemapGenerator,
  },
);
