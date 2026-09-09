import { readAuthorizedFile } from "../../api/runtime/files";
import { type Base85Variant, decodeBase85 } from "./logic";

export function decodeBase85Result(
  input: string,
  variant: Base85Variant,
  outputEncoding: "utf8" | "base64",
) {
  const bytes = decodeBase85(input, { variant });
  try {
    return {
      output:
        outputEncoding === "utf8"
          ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
          : Buffer.from(bytes).toString("base64"),
      encoding: outputEncoding,
      bytes: bytes.length,
    };
  } finally {
    bytes.fill(0);
  }
}

export async function decodeBase85Path(
  inputPath: string,
  roots: readonly string[],
  variant: Base85Variant,
  outputEncoding: "utf8" | "base64",
  signal?: AbortSignal,
) {
  const bytes = await readAuthorizedFile(inputPath, roots, signal);
  try {
    const input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decodeBase85Result(input, variant, outputEncoding);
  } finally {
    bytes.fill(0);
  }
}
