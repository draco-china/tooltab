import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const pdfInfoViewerHead = seo(
  m["shared.pdfEditing.readinfoname"],
  m["shared.pdfEditing.readinfodescription"],
);

export const pdfTextExtractorHead = seo(
  m["shared.pdfEditing.readtextname"],
  m["shared.pdfEditing.readtextdescription"],
);

export const pdfToImageConverterHead = seo(
  m["shared.pdfEditing.readimagename"],
  m["shared.pdfEditing.readimagedescription"],
);
