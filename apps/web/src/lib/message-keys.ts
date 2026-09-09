import type { m } from "@/paraglide/messages.js";

/** Catalog metadata and dynamic labels cannot require interpolation inputs. */
export type MessageKey = {
  // biome-ignore lint/complexity/noBannedTypes: `{}` detects messages without required interpolation inputs.
  [Key in keyof typeof m]: {} extends NonNullable<
    Parameters<(typeof m)[Key]>[0]
  >
    ? Key
    : never;
}[keyof typeof m];

export type MessageFunction = (
  inputs: Record<string, never>,
  options?: { locale?: import("@/paraglide/runtime.js").Locale },
) => string;
