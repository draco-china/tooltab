import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const uuidMaxGeneratorHead = seo(
  m["shared.uuidGenerator.maxName"],
  m["shared.uuidGenerator.maxDescription"],
);

export const uuidNilGeneratorHead = seo(
  m["shared.uuidGenerator.nilName"],
  m["shared.uuidGenerator.nilDescription"],
);

export const uuidV4BulkGeneratorHead = seo(
  m["shared.uuidGenerator.bulkName"],
  m["shared.uuidGenerator.bulkDescription"],
);

export const uuidV4GeneratorHead = seo(
  m["shared.uuidGenerator.v4Name"],
  m["shared.uuidGenerator.v4Description"],
);
