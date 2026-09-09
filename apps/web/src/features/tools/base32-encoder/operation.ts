import { encodeBytesAsBase32 } from "./logic";

export function encodeBase32Operation(
  input: Uint8Array,
  options: Readonly<{ padding?: boolean }> = {},
) {
  return encodeBytesAsBase32(input, options);
}
