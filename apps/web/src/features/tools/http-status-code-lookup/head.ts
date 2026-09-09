import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const httpStatusCodeLookupHead = seo(
  m["shared.referenceLookups.statusname"],
  m["shared.referenceLookups.statusdescription"],
);
