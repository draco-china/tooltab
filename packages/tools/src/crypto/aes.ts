import * as z from "zod/v4";
export const MAX_AES_BYTES = 32 * 1024 * 1024,
  MAX_AES_ENVELOPE = 48 * 1024 * 1024;
export const AES_MODES = ["GCM", "CBC", "CTR"] as const,
  KEY_BITS = [128, 192, 256] as const,
  PBKDF_HASHES = ["SHA-256", "SHA-384", "SHA-512"] as const;
export type AesMode = (typeof AES_MODES)[number];
export class AesToolError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "invalid_envelope"
      | "invalid_key"
      | "invalid_options"
      | "decrypt_failed"
      | "invalid_utf8"
      | "too_large"
      | "random_unavailable"
      | "unsupported"
      | "timeout"
      | "busy"
      | "artifact_required"
      | "read_failed",
  ) {
    super(code);
  }
}
const bits = z.union([z.literal(128), z.literal(192), z.literal(256)]),
  iterations = z.number().int().min(1000).max(10000000);
const metadataSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text") }),
  z.strictObject({
    type: z.literal("file"),
    name: z.string().max(4096),
    mimeType: z.string().max(1024),
    size: z.number().int().min(0).max(MAX_AES_BYTES),
  }),
]);
export const envelopeSchema = z.strictObject({
  version: z.literal("inbrowser-aes-v1"),
  algorithm: z.enum(["AES-GCM", "AES-CBC", "AES-CTR"]),
  key: z.discriminatedUnion("source", [
    z.strictObject({ source: z.literal("raw"), lengthBits: bits }),
    z.strictObject({
      source: z.literal("password"),
      derivation: z.literal("PBKDF2"),
      hash: z.enum(PBKDF_HASHES),
      iterations,
      lengthBits: bits,
      salt: z.string().max(256),
    }),
  ]),
  iv: z.string().max(256),
  ciphertext: z.string().max(MAX_AES_ENVELOPE),
  encoding: z.literal("base64"),
  plaintext: metadataSchema,
});
export type Envelope = z.infer<typeof envelopeSchema>;
export type EncryptOptions = {
  mode: AesMode;
  keyLengthBits: 128 | 192 | 256;
  keySource: "password" | "raw";
  password?: string;
  rawKeyHex?: string;
  pbkdf2Hash: (typeof PBKDF_HASHES)[number];
  pbkdf2Iterations: number;
};
export const aesDefaults: EncryptOptions = {
  mode: "GCM",
  keyLengthBits: 256,
  keySource: "password",
  password: "",
  pbkdf2Hash: "SHA-256",
  pbkdf2Iterations: 210000,
};
export type AesMaterial = { password?: string; rawKeyHex?: string };
export function utf8(text: string) {
  if (
    typeof text !== "string" ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      text,
    )
  )
    throw new AesToolError("invalid_utf8");
  return new TextEncoder().encode(text);
}
export function hexBytes(value: string, length: number) {
  if (typeof value !== "string" || value.length > 1048576)
    throw new AesToolError("invalid_key");
  const clean = value.replace(/[\s:]/g, "");
  if (clean.length !== length * 2 || /[^0-9a-f]/i.test(clean))
    throw new AesToolError("invalid_key");
  return Uint8Array.from({ length }, (_, i) =>
    Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16),
  );
}
export function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function toBase64(bytes: Uint8Array) {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (native) return native.call(bytes);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(""));
}
export function fromBase64(value: string, maxBytes = MAX_AES_BYTES + 16) {
  if (typeof value !== "string" || value.length > MAX_AES_ENVELOPE)
    throw new AesToolError("too_large");
  let clean = value.replace(/[\t\n\f\r ]/g, "");
  if (/[^A-Za-z0-9+/=]/.test(clean) || clean.length % 4 === 1)
    throw new AesToolError("invalid_envelope");
  if (!clean.includes("="))
    clean = clean.padEnd(Math.ceil(clean.length / 4) * 4, "=");
  const first = clean.indexOf("=");
  if (
    clean.length % 4 ||
    (first !== -1 &&
      (first < clean.length - 2 || /[^=]/.test(clean.slice(first))))
  )
    throw new AesToolError("invalid_envelope");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (
    (clean.endsWith("==") &&
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      (alphabet.indexOf(clean[clean.length - 3]!) & 15) !== 0) ||
    (clean.endsWith("=") &&
      !clean.endsWith("==") &&
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      (alphabet.indexOf(clean[clean.length - 2]!) & 3) !== 0)
  )
    throw new AesToolError("invalid_envelope");
  if (
    (clean.length / 4) * 3 -
      (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0) >
    maxBytes
  )
    throw new AesToolError("too_large");
  try {
    const native = (
      Uint8Array as unknown as {
        fromBase64?: (text: string) => Uint8Array<ArrayBuffer>;
      }
    ).fromBase64;
    if (native) return native(clean);
    const binary = atob(clean),
      bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw new AesToolError("invalid_envelope");
  }
}
function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new AesToolError("unsupported");
  return globalThis.crypto.subtle;
}
function random(length: number) {
  try {
    return crypto.getRandomValues(new Uint8Array(length));
  } catch {
    throw new AesToolError("random_unavailable");
  }
}
function params(mode: AesMode, iv: Uint8Array) {
  const bytes = new Uint8Array(iv);
  return mode === "GCM"
    ? { name: "AES-GCM", iv: bytes, tagLength: 128 }
    : mode === "CBC"
      ? { name: "AES-CBC", iv: bytes }
      : { name: "AES-CTR", counter: bytes, length: 64 };
}
async function keyFor(
  key: Envelope["key"],
  mode: AesMode,
  material: AesMaterial,
  usage: "encrypt" | "decrypt",
) {
  const subtle = cryptoApi();
  if (key.source === "raw")
    return subtle.importKey(
      "raw",
      hexBytes(material.rawKeyHex ?? "", key.lengthBits / 8),
      { name: `AES-${mode}` },
      false,
      [usage],
    );
  if (typeof material.password !== "string" || !material.password)
    throw new AesToolError("invalid_key");
  const password = utf8(material.password);
  if (password.length > 1048576) throw new AesToolError("too_large");
  const base = await subtle.importKey("raw", password, "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: hexBytes(key.salt, 16),
      hash: key.hash,
      iterations: key.iterations,
    },
    base,
    { name: `AES-${mode}`, length: key.lengthBits },
    false,
    [usage],
  );
}
export function inspectEnvelope(input: string) {
  if (typeof input !== "string" || input.length > MAX_AES_ENVELOPE)
    throw new AesToolError("too_large");
  if (utf8(input).length > MAX_AES_ENVELOPE)
    throw new AesToolError("too_large");
  let envelope: Envelope;
  try {
    envelope = envelopeSchema.parse(JSON.parse(input));
  } catch {
    throw new AesToolError("invalid_envelope");
  }
  const mode = envelope.algorithm.slice(4) as AesMode;
  try {
    envelope.iv = hex(hexBytes(envelope.iv, mode === "GCM" ? 12 : 16));
    if (envelope.key.source === "password")
      envelope.key.salt = hex(hexBytes(envelope.key.salt, 16));
  } catch {
    throw new AesToolError("invalid_envelope");
  }
  const ciphertext = fromBase64(envelope.ciphertext);
  if (
    (mode === "GCM" && ciphertext.length < 16) ||
    (mode === "CBC" && (ciphertext.length === 0 || ciphertext.length % 16))
  )
    throw new AesToolError("invalid_envelope");
  return { envelope, mode, ciphertext };
}
export async function encryptAes(
  input: string | Uint8Array,
  options: EncryptOptions,
  metadata: Envelope["plaintext"] = { type: "text" },
) {
  if (typeof input !== "string" && !(input instanceof Uint8Array))
    throw new AesToolError("invalid_input");
  // Reject known oversized binary input before allocating its private snapshot.
  if (typeof input !== "string" && input.byteLength > MAX_AES_BYTES)
    throw new AesToolError("too_large");
  const data = typeof input === "string" ? utf8(input) : new Uint8Array(input);
  if (data.length > MAX_AES_BYTES) throw new AesToolError("too_large");
  if (
    !AES_MODES.includes(options.mode) ||
    !KEY_BITS.includes(options.keyLengthBits) ||
    !["password", "raw"].includes(options.keySource)
  )
    throw new AesToolError("invalid_options");
  if (
    !PBKDF_HASHES.includes(options.pbkdf2Hash) ||
    !iterations.safeParse(options.pbkdf2Iterations).success
  )
    throw new AesToolError("invalid_options");
  const parsedMeta = metadataSchema.safeParse(metadata);
  if (
    !parsedMeta.success ||
    (metadata.type === "file" && metadata.size !== data.length)
  )
    throw new AesToolError("invalid_options");
  const key: Envelope["key"] =
    options.keySource === "raw"
      ? { source: "raw", lengthBits: options.keyLengthBits }
      : {
          source: "password",
          derivation: "PBKDF2",
          hash: options.pbkdf2Hash,
          iterations: options.pbkdf2Iterations,
          lengthBits: options.keyLengthBits,
          salt: hex(random(16)),
        };
  const iv = random(options.mode === "GCM" ? 12 : 16),
    cryptoKey = await keyFor(key, options.mode, options, "encrypt"),
    ciphertext = new Uint8Array(
      await cryptoApi().encrypt(params(options.mode, iv), cryptoKey, data),
    );
  const envelope: Envelope = {
    version: "inbrowser-aes-v1",
    algorithm: `AES-${options.mode}`,
    key,
    iv: hex(iv),
    ciphertext: toBase64(ciphertext),
    encoding: "base64",
    plaintext: parsedMeta.data,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  const outputBytes = utf8(json).length;
  return {
    kind: "encrypted" as const,
    json,
    envelope,
    bytes: data.length,
    outputBytes,
  };
}
export async function decryptAes(input: string, material: AesMaterial) {
  const { envelope, mode, ciphertext } = inspectEnvelope(input),
    key = await keyFor(envelope.key, mode, material, "decrypt");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(
      await cryptoApi().decrypt(
        params(mode, hexBytes(envelope.iv, mode === "GCM" ? 12 : 16)),
        key,
        ciphertext,
      ),
    );
  } catch {
    throw new AesToolError("decrypt_failed");
  }
  if (bytes.length > MAX_AES_BYTES) throw new AesToolError("too_large");
  let text: string | null = null;
  if (envelope.plaintext.type === "text") {
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      /* Keep exact bytes downloadable when unauthenticated data is not UTF-8. */
    }
  }
  return {
    kind: "decrypted" as const,
    bytes,
    text,
    metadata: envelope.plaintext,
    algorithm: envelope.algorithm,
    authenticated: mode === "GCM",
    metadataAuthenticated: false as const,
    sizeMatches:
      envelope.plaintext.type === "file"
        ? envelope.plaintext.size === bytes.length
        : null,
  };
}
