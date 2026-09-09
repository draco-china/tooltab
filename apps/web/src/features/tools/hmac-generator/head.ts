import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const hmacGeneratorHead = seo(
  m["shared.macIntegrity.hmacname"],
  m["shared.macIntegrity.hmacdescription"],
);
