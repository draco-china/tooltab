export const MAX_JOSE_INPUT = 1048576;
export class JoseToolError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function bounded(s: string, limit = MAX_JOSE_INPUT) {
  if (s.length > limit || new TextEncoder().encode(s).length > limit)
    throw new JoseToolError("too_large");
  if (/[\uD800-\uDFFF]/u.test(s)) throw new JoseToolError("invalid_unicode");
  return s;
}
export function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
export function parseJson(s: string): unknown {
  bounded(s);
  let depth = 0;
  for (const token of s.match(/"(?:[^"\\]|\\[\s\S])*"|[{}[\]]/g) ?? []) {
    if (token === "{" || token === "[") depth++;
    else if (token === "}" || token === "]") depth--;
    if (depth > 64) throw new JoseToolError("too_deep");
  }
  try {
    return JSON.parse(s);
  } catch {
    throw new JoseToolError("invalid_json");
  }
}
export function jsonObject(s: string) {
  const value = parseJson(s);
  if (!object(value)) throw new JoseToolError("object_required");
  return value;
}
export function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function url64(bytes: Uint8Array) {
  return base64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function fromUrl64(s: string) {
  if (!/^[\w-]*$/.test(s) || s.length % 4 === 1)
    throw new JoseToolError("invalid_base64");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(
      atob(
        s.replaceAll("-", "+").replaceAll("_", "/") +
          "=".repeat((4 - (s.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
  } catch {
    throw new JoseToolError("invalid_base64");
  }
  if (url64(bytes) !== s) throw new JoseToolError("invalid_base64");
  return bytes;
}
export function fromBase64(s: string) {
  const plain = s.replace(/\s/g, "");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      plain,
    )
  )
    throw new JoseToolError("invalid_base64");
  const bytes = Uint8Array.from(atob(plain), (c) => c.charCodeAt(0));
  if (base64(bytes) !== plain) throw new JoseToolError("invalid_base64");
  return bytes;
}
export function utf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JoseToolError("invalid_unicode");
  }
}

export function assertSafeIntegers(text: string) {
  for (const token of text.match(
    /"(?:[^"\\]|\\[\s\S])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
  ) ?? []) {
    if (
      !token.startsWith('"') &&
      (!Number.isFinite(Number(token)) ||
        (Number.isInteger(Number(token)) &&
          !Number.isSafeInteger(Number(token))))
    )
      throw new JoseToolError("unsafe_number");
  }
}
