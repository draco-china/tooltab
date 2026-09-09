import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const barcodeGeneratorHead = seo(
  m["shared.barcode.generatorname"],
  m["shared.barcode.generatordescription"],
);

export const barcodeReaderHead = seo(
  m["shared.barcode.readername"],
  m["shared.barcode.readerdescription"],
);
