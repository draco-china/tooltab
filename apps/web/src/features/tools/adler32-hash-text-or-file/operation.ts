import {
  type Adler32Result,
  createAdler32State,
  formatAdler32,
  updateAdler32,
} from "@workspace/tools/checksum/adler32";
import { textBytes } from "./logic";

export function calculateAdler32(input: Uint8Array): Adler32Result {
  return formatAdler32(updateAdler32(createAdler32State(), input));
}

export function calculateAdler32Text(text: string): Adler32Result {
  return calculateAdler32(textBytes(text));
}
