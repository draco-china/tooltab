import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const argon2HashPasswordVerifierHead = seo(
  m["shared.argon2.argonVerifyName"],
  m["shared.argon2.argonVerifyDescription"],
);

export const argon2HashPasswordHead = seo(
  m["shared.argon2.argonHashName"],
  m["shared.argon2.argonHashDescription"],
);
