import { type Base85Variant, encodeBase85 } from "./logic";

export function encodeBase85Operation(
  input: Uint8Array,
  variant: Base85Variant = "ascii85",
) {
  return encodeBase85(input, { variant });
}
