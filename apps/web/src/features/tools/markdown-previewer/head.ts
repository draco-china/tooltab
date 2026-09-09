import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const markdownPreviewerHead = seo(
  m["shared.markdownTools.previewname"],
  m["shared.markdownTools.previewdescription"],
);
