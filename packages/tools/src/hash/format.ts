export type HashFormat = "hex" | "base64" | "decimal" | "binary";
export function formatHash(bytes: Uint8Array, format: HashFormat): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  switch (format) {
    case "hex":
      return hex;
    case "base64": {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    }
    case "decimal":
      return bytes.length ? BigInt(`0x${hex}`).toString(10) : "0";
    case "binary":
      return Array.from(bytes, (byte) =>
        byte.toString(2).padStart(8, "0"),
      ).join("");
  }
}

/** Describe a digest without retaining the input or the digest buffer. */
export function formatDigest<A extends string>(
  algorithm: A,
  bytes: number,
  digest: Uint8Array,
) {
  return {
    algorithm,
    bytes,
    outputBits: digest.length * 8,
    hex: formatHash(digest, "hex"),
    base64: formatHash(digest, "base64"),
    decimal: formatHash(digest, "decimal"),
    binary: formatHash(digest, "binary"),
  };
}
export type DigestResult<A extends string = string> = ReturnType<
  typeof formatDigest<A>
>;
