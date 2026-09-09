import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const aesDecryptorHead = seo(
  m["shared.aesTools.decryptname"],
  m["shared.aesTools.decryptdescription"],
);

export const aesEncryptorHead = seo(
  m["shared.aesTools.encryptname"],
  m["shared.aesTools.encryptdescription"],
);
