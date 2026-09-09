import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const isbnValidatorHead = seo(
  m["shared.checksumValidators.isbnname"],
  m["shared.checksumValidators.isbndescription"],
);
