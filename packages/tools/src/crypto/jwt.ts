import {
  CompactSign,
  compactVerify,
  errors,
  importJWK,
  importPKCS8,
  importSPKI,
  type JWK,
} from "jose";
import { formatJson } from "../json/format";
import {
  assertSafeIntegers,
  bounded,
  fromUrl64,
  JoseToolError,
  jsonObject,
  MAX_JOSE_INPUT,
  object,
  parseJson,
  utf8,
} from "./jose-common";
export const JWT_ALGORITHMS = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
] as const;
export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];
export type ClaimCheck = {
  claim: string;
  status: "invalid" | "expired" | "future" | "valid";
  value: unknown;
  date: string | null;
};
export function inspectClaims(
  payload: unknown,
  now = Math.floor(Date.now() / 1000),
): ClaimCheck[] {
  if (!object(payload)) return [];
  return ["exp", "nbf", "iat"]
    .filter((k) => Object.hasOwn(payload, k))
    .map((claim) => {
      const value = payload[claim];
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > 8640000000000
      )
        return { claim, status: "invalid", value, date: null };
      const status =
        claim === "exp"
          ? now >= value
            ? "expired"
            : "valid"
          : now < value
            ? "future"
            : "valid";
      return {
        claim,
        status,
        value,
        date: new Date(value * 1000).toISOString(),
      };
    });
}
export function decodeToken(input: string, now?: number) {
  const token = bounded(input, MAX_JOSE_INPUT * 4).trim(),
    parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1])
    throw new JoseToolError("invalid_token");
  const headerJson = utf8(fromUrl64(parts[0])),
    payloadJson = utf8(fromUrl64(parts[1]));
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  fromUrl64(parts[2]!);
  const header = jsonObject(headerJson),
    payload = parseJson(payloadJson);
  return {
    token,
    header,
    payload,
    headerJson:
      headerJson.length > 65536
        ? formatJson(headerJson, "compact")
        : formatJson(headerJson, "2"),
    payloadJson:
      payloadJson.length > 65536
        ? formatJson(payloadJson, "compact")
        : formatJson(payloadJson, "2"),
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    signature: parts[2]!,
    claims: inspectClaims(payload, now),
  };
}
function algorithm(value: unknown): JwtAlgorithm {
  if (
    typeof value !== "string" ||
    !JWT_ALGORITHMS.includes(value as JwtAlgorithm)
  )
    throw new JoseToolError("unsupported_algorithm");
  return value as JwtAlgorithm;
}
function compatible(
  jwk: Record<string, unknown>,
  alg: JwtAlgorithm,
  sign: boolean,
) {
  const family = alg.slice(0, 2),
    type = family === "HS" ? "oct" : family === "ES" ? "EC" : "RSA";
  if (
    jwk.kty !== type ||
    (jwk.alg !== undefined && jwk.alg !== alg) ||
    (jwk.use !== undefined && jwk.use !== "sig")
  )
    throw new JoseToolError("key_mismatch");
  if (
    jwk.key_ops !== undefined &&
    (!Array.isArray(jwk.key_ops) ||
      !jwk.key_ops.includes(sign ? "sign" : "verify"))
  )
    throw new JoseToolError("key_mismatch");
  if (
    type === "EC" &&
    jwk.crv !==
      (
        { ES256: "P-256", ES384: "P-384", ES512: "P-521" } as Record<
          string,
          string
        >
      )[alg]
  )
    throw new JoseToolError("key_mismatch");
  if (sign && type !== "oct" && typeof jwk.d !== "string")
    throw new JoseToolError("private_key_required");
  if (type === "oct" && typeof jwk.k !== "string")
    throw new JoseToolError("invalid_key");
}
async function loadKey(
  text: string,
  alg: JwtAlgorithm,
  format: "secret" | "pem" | "jwk",
  sign: boolean,
  header: Record<string, unknown>,
) {
  bounded(text);
  if (!text.trim()) throw new JoseToolError("key_required");
  if (format === "secret") {
    if (!alg.startsWith("HS") || text.trim().startsWith("-----BEGIN "))
      throw new JoseToolError("key_mismatch");
    return new TextEncoder().encode(text);
  }
  if (format === "pem") {
    if (alg.startsWith("HS")) throw new JoseToolError("key_mismatch");
    const label = sign ? "PRIVATE KEY" : "PUBLIC KEY";
    if (!text.trim().startsWith(`-----BEGIN ${label}-----`))
      throw new JoseToolError("invalid_key");
    try {
      return sign ? await importPKCS8(text, alg) : await importSPKI(text, alg);
    } catch {
      throw new JoseToolError("invalid_key");
    }
  }
  const parsed = jsonObject(text);
  let candidates: Record<string, unknown>[];
  if (Object.hasOwn(parsed, "keys")) {
    if (
      sign ||
      !Array.isArray(parsed.keys) ||
      parsed.keys.length === 0 ||
      parsed.keys.length > 100 ||
      !parsed.keys.every(object)
    )
      throw new JoseToolError("invalid_key");
    candidates = parsed.keys
      .filter((k) => header.kid === undefined || k.kid === header.kid)
      .filter((k) => {
        try {
          compatible(k, alg, sign);
          return true;
        } catch {
          return false;
        }
      });
    if (candidates.length !== 1) throw new JoseToolError("key_ambiguous");
  } else candidates = [parsed];
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const jwk = candidates[0]!;
  compatible(jwk, alg, sign);
  try {
    return await importJWK(jwk as JWK, alg);
  } catch {
    throw new JoseToolError("invalid_key");
  }
}
export type VerifyOptions = {
  token: string;
  key: string;
  algorithm: "auto" | JwtAlgorithm;
  now?: number;
};
export async function verifyToken(p: VerifyOptions) {
  const decoded = decodeToken(p.token, p.now),
    alg = algorithm(decoded.header.alg);
  if (p.algorithm !== "auto" && p.algorithm !== alg)
    throw new JoseToolError("algorithm_mismatch");
  if (decoded.header.b64 === false || decoded.header.crit !== undefined)
    throw new JoseToolError("unsupported_header");
  const keyText = p.key.trim();
  const format = keyText.startsWith("{")
    ? "jwk"
    : keyText.startsWith("-----")
      ? "pem"
      : "secret";
  const key = await loadKey(p.key, alg, format, false, decoded.header);
  try {
    await compactVerify(decoded.token, key, { algorithms: [alg] });
    return { ...decoded, algorithm: alg, signatureValid: true };
  } catch (error) {
    if (error instanceof errors.JWSSignatureVerificationFailed)
      return { ...decoded, algorithm: alg, signatureValid: false };
    throw new JoseToolError("invalid_key");
  }
}
export type SignOptions = {
  payload: string;
  header: string;
  key: string;
  keyFormat: "secret" | "pem" | "jwk";
  algorithm: JwtAlgorithm;
  iatNow?: boolean;
  expirationOffset?: number | null;
  now?: number;
};
export async function signToken(p: SignOptions) {
  const alg = algorithm(p.algorithm),
    payload = jsonObject(p.payload),
    extra = jsonObject(p.header.trim() || "{}");
  if (extra.b64 !== undefined || extra.crit !== undefined)
    throw new JoseToolError("unsupported_header");
  let payloadText = p.payload;
  if (
    p.iatNow ||
    (p.expirationOffset !== undefined && p.expirationOffset !== null)
  ) {
    assertSafeIntegers(p.payload);
    const now = p.now ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(now)) throw new JoseToolError("invalid_claim");
    if (p.iatNow) payload.iat = now;
    if (p.expirationOffset !== undefined && p.expirationOffset !== null) {
      if (![900, 3600, 86400, 604800].includes(p.expirationOffset))
        throw new JoseToolError("invalid_claim");
      const base = payload.iat ?? now;
      if (typeof base !== "number" || !Number.isFinite(base))
        throw new JoseToolError("invalid_claim");
      payload.exp = base + p.expirationOffset;
    }
    payloadText = JSON.stringify(payload);
  }
  assertSafeIntegers(p.header);
  const protectedHeader = { typ: "JWT", ...extra, alg };
  const key = await loadKey(p.key, alg, p.keyFormat, true, protectedHeader);
  try {
    const token = await new CompactSign(
      new TextEncoder().encode(formatJson(payloadText, "compact")),
    )
      .setProtectedHeader(protectedHeader)
      .sign(key);
    return { ...decodeToken(token, p.now), algorithm: alg };
  } catch {
    throw new JoseToolError("sign_failed");
  }
}
