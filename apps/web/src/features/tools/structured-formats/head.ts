import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const tomlToYamlConverterHead = seo(
  m["shared.structuredFormats.tomltoyamlname"],
  m["shared.structuredFormats.tomltoyamldescription"],
);

export const yamlToJsonConverterHead = seo(
  m["shared.structuredFormats.yamltojsonname"],
  m["shared.structuredFormats.yamltojsondescription"],
);

export const yamlToTomlConverterHead = seo(
  m["shared.structuredFormats.yamltotomlname"],
  m["shared.structuredFormats.yamltotomldescription"],
);
