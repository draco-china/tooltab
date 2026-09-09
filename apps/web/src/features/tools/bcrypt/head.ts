import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const bcryptHashPasswordVerifierHead = seo(
  m["shared.bcrypt.verifyName"],
  m["shared.bcrypt.verifyDescription"],
);

export const bcryptHashPasswordHead = seo(
  m["shared.bcrypt.hashName"],
  m["shared.bcrypt.hashDescription"],
);
