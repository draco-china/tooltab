import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const sitemapXmlGeneratorHead = seo(
  m["shared.seoGenerators.sitemapname"],
  m["shared.seoGenerators.sitemapdescription"],
);
