/** Fingerprints identify encoded certificate/key bytes; they do not establish trust. */
export async function fingerprintBytes(input: BufferSource) {
  const [sha1, sha256] = await Promise.all([
    crypto.subtle.digest("SHA-1", input),
    crypto.subtle.digest("SHA-256", input),
  ]);
  return { sha1: hex(sha1), sha256: hex(sha256) };
}
function hex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join(":")
    .toUpperCase();
}
