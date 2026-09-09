import { m } from "@/paraglide/messages.js";
export const qrErrorMessages = {
  missing_content: m["shared.qrTools.missing"],
  invalid_date: m["shared.qrTools.invaliddate"],
  invalid_location: m["shared.qrTools.invalidlocation"],
  capacity: m["shared.qrTools.capacity"],
  too_large: m["shared.qrTools.toolarge"],
  invalid_input: m["shared.qrTools.invalidinput"],
  unsupported: m["shared.qrTools.unsupported"],
  timeout: m["shared.qrTools.timeout"],
  decode_failed: m["shared.qrTools.decodefailed"],
  busy: m["shared.qrTools.busy"],
} as const;
