import { getPublicKeyAsync } from "@noble/ed25519";
import * as asn from "asn1js";
import {
  base64,
  bounded,
  fromBase64,
  fromUrl64,
  JoseToolError,
  jsonObject,
  object,
  url64,
} from "./jose-common";

const RSA = "1.2.840.113549.1.1.1",
  EC = "1.2.840.10045.2.1";
const curves: Record<string, string> = {
  "P-256": "1.2.840.10045.3.1.7",
  "P-384": "1.3.132.0.34",
  "P-521": "1.3.132.0.35",
  Ed25519: "1.3.101.112",
  Ed448: "1.3.101.113",
  X25519: "1.3.101.110",
  X448: "1.3.101.111",
};
const sizes: Record<string, number> = {
  Ed25519: 32,
  Ed448: 57,
  X25519: 32,
  X448: 56,
};
const seq = (...value: asn.BaseBlock[]) => new asn.Sequence({ value });
const oid = (value: string) => new asn.ObjectIdentifier({ value });
const oct = (value: Uint8Array) =>
  new asn.OctetString({ valueHex: value.slice().buffer });
function decode(der: Uint8Array): asn.BaseBlock {
  const parsed = asn.fromBER(der, {
    maxDepth: 32,
    maxNodes: 4096,
    maxContentLength: 1048576,
  });
  if (parsed.offset !== der.length || parsed.result.error)
    throw new JoseToolError("invalid_pem");
  return parsed.result;
}
function children(node: asn.BaseBlock) {
  if (!(node instanceof asn.Sequence) && !(node instanceof asn.Constructed))
    throw new JoseToolError("invalid_pem");
  return node.valueBlock.value;
}
function octets(node: asn.BaseBlock | undefined) {
  if (!(node instanceof asn.OctetString) || node.idBlock.isConstructed)
    throw new JoseToolError("invalid_pem");
  return new Uint8Array(node.valueBlock.valueHexView);
}
function bits(node: asn.BaseBlock | undefined) {
  if (
    !(node instanceof asn.BitString) ||
    node.valueBlock.unusedBits !== 0 ||
    node.idBlock.isConstructed
  )
    throw new JoseToolError("invalid_pem");
  return new Uint8Array(node.valueBlock.valueHexView);
}
function oidValue(node: asn.BaseBlock | undefined) {
  if (!(node instanceof asn.ObjectIdentifier))
    throw new JoseToolError("invalid_pem");
  return node.valueBlock.toString();
}
function bytes(node: asn.BaseBlock) {
  return new Uint8Array(node.toBER(false));
}
function pem(label: string, der: Uint8Array) {
  return `-----BEGIN ${label}-----\n${base64(der)
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END ${label}-----\n`;
}
function algFrom(node: asn.BaseBlock) {
  const parts = children(node),
    id = oidValue(parts[0]);
  if (id === RSA)
    return {
      type: "RSA",
      algorithm: { name: "RSA-OAEP", hash: "SHA-256" },
      curve: "",
    };
  if (id === EC) {
    const curve = Object.keys(curves).find(
      (k) => k.startsWith("P-") && curves[k] === oidValue(parts[1]),
    );
    if (!curve) throw new JoseToolError("unsupported_curve");
    return {
      type: "EC",
      algorithm: { name: "ECDSA", namedCurve: curve },
      curve,
    };
  }
  const curve = Object.keys(sizes).find((k) => curves[k] === id);
  if (!curve) throw new JoseToolError("unsupported_curve");
  if (parts.length !== 1) throw new JoseToolError("invalid_pem");
  return { type: "OKP", algorithm: { name: curve }, curve };
}
export function listJwks(text: string) {
  const parsed = jsonObject(text);
  if (Object.hasOwn(parsed, "keys")) {
    if (
      !Array.isArray(parsed.keys) ||
      parsed.keys.length === 0 ||
      parsed.keys.length > 100 ||
      !parsed.keys.every(object)
    )
      throw new JoseToolError("invalid_key");
    return parsed.keys;
  }
  return [parsed];
}
function required(jwk: Record<string, unknown>, field: string) {
  if (typeof jwk[field] !== "string" || !jwk[field])
    throw new JoseToolError("missing_key_field");
  if (field !== "crv") fromUrl64(jwk[field]);
  return jwk[field];
}
export async function jwkToPem(
  text: string,
  index: number,
  output: "public" | "private",
) {
  const keys = listJwks(text),
    jwk = keys[index];
  if (!jwk || !Number.isInteger(index) || index < 0)
    throw new JoseToolError("invalid_key");
  const isPrivate = output === "private";
  if (output !== "public" && !isPrivate) throw new JoseToolError("invalid_key");
  if (jwk.kty === "OKP") {
    const curve = required(jwk, "crv"),
      size = sizes[curve];
    if (!size) throw new JoseToolError("unsupported_curve");
    const raw = fromUrl64(required(jwk, isPrivate ? "d" : "x"));
    if (raw.length !== size) throw new JoseToolError("invalid_key");
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const algorithm = seq(oid(curves[curve]!));
    const result = isPrivate
      ? seq(new asn.Integer({ value: 0 }), algorithm, oct(bytes(oct(raw))))
      : seq(algorithm, new asn.BitString({ valueHex: raw.buffer }));
    return {
      output: pem(isPrivate ? "PRIVATE KEY" : "PUBLIC KEY", bytes(result)),
      warnings: [] as string[],
    };
  }
  const sanitized: JsonWebKey = {
    kty: typeof jwk.kty === "string" ? jwk.kty : undefined,
  };
  let algorithm: RsaHashedImportParams | EcKeyImportParams;
  if (jwk.kty === "RSA") {
    sanitized.n = required(jwk, "n");
    sanitized.e = required(jwk, "e");
    if (isPrivate) {
      for (const field of ["d", "p", "q", "dp", "dq", "qi"] as const)
        sanitized[field] = required(jwk, field);
    }
    algorithm = { name: "RSA-OAEP", hash: "SHA-256" };
  } else if (jwk.kty === "EC") {
    const curve = required(jwk, "crv");
    if (!["P-256", "P-384", "P-521"].includes(curve))
      throw new JoseToolError("unsupported_curve");
    sanitized.crv = curve;
    sanitized.x = required(jwk, "x");
    sanitized.y = required(jwk, "y");
    if (isPrivate) sanitized.d = required(jwk, "d");
    algorithm = { name: "ECDSA", namedCurve: curve };
  } else throw new JoseToolError("unsupported_key_type");
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      sanitized,
      algorithm,
      true,
      isPrivate
        ? [jwk.kty === "RSA" ? "decrypt" : "sign"]
        : [jwk.kty === "RSA" ? "encrypt" : "verify"],
    );
    const der = await crypto.subtle.exportKey(
      isPrivate ? "pkcs8" : "spki",
      key,
    );
    return {
      output: pem(
        isPrivate ? "PRIVATE KEY" : "PUBLIC KEY",
        new Uint8Array(der),
      ),
      warnings: [] as string[],
    };
  } catch {
    throw new JoseToolError("invalid_key");
  }
}
async function derToJwk(der: Uint8Array, label: string): Promise<JsonWebKey> {
  let root = decode(der),
    parts = children(root),
    privateKey = false;
  if (label === "RSA PUBLIC KEY") {
    root = seq(
      seq(oid(RSA), new asn.Null()),
      new asn.BitString({ valueHex: der.slice().buffer }),
    );
    label = "PUBLIC KEY";
  } else if (label === "RSA PRIVATE KEY") {
    root = seq(
      new asn.Integer({ value: 0 }),
      seq(oid(RSA), new asn.Null()),
      oct(der),
    );
    label = "PRIVATE KEY";
  } else if (label === "EC PRIVATE KEY") {
    const context = parts.find(
      (p) => p.idBlock.tagClass === 3 && p.idBlock.tagNumber === 0,
    );
    const curveOid = context ? oidValue(children(context)[0]) : "";
    if (
      !Object.entries(curves).some(
        ([k, v]) => k.startsWith("P-") && v === curveOid,
      )
    )
      throw new JoseToolError("unsupported_curve");
    root = seq(
      new asn.Integer({ value: 0 }),
      seq(oid(EC), oid(curveOid)),
      oct(der),
    );
    label = "PRIVATE KEY";
  } else if (label === "DER") {
    label = parts[0] instanceof asn.Integer ? "PRIVATE KEY" : "PUBLIC KEY";
  }
  if (label !== "PRIVATE KEY" && label !== "PUBLIC KEY")
    throw new JoseToolError("unsupported_pem");
  privateKey = label === "PRIVATE KEY";
  parts = children(root);
  if (privateKey) {
    const version = parts[0];
    if (
      !(version instanceof asn.Integer) ||
      ![0, 1].includes(version.valueBlock.valueDec) ||
      parts.length < 3 ||
      parts.length > 5
    )
      throw new JoseToolError("invalid_pem");
    if (
      parts.some(
        (p) => p.idBlock.tagClass === 3 && p.idBlock.tagNumber === 1,
      ) &&
      version.valueBlock.valueDec !== 1
    )
      throw new JoseToolError("invalid_pem");
  } else if (parts.length !== 2) throw new JoseToolError("invalid_pem");
  const algorithm = algFrom(parts[privateKey ? 1 : 0]);
  if (algorithm.type === "OKP") {
    const raw = privateKey ? octets(decode(octets(parts[2]))) : bits(parts[1]);
    if (raw.length !== sizes[algorithm.curve])
      throw new JoseToolError("invalid_key");
    if (!privateKey) return { kty: "OKP", crv: algorithm.curve, x: url64(raw) };
    const context = parts.find(
      (p) => p.idBlock.tagClass === 3 && p.idBlock.tagNumber === 1,
    );
    let publicBytes: Uint8Array | undefined;
    if (context instanceof asn.Constructed)
      publicBytes = bits(children(context)[0]);
    else if (context instanceof asn.Primitive) {
      const rawPublic = context.valueBlock.valueHexView;
      if (rawPublic[0] !== 0) throw new JoseToolError("invalid_pem");
      publicBytes = rawPublic.slice(1);
    }
    if (!publicBytes && algorithm.curve === "Ed25519")
      publicBytes = await getPublicKeyAsync(raw);
    if (!publicBytes) throw new JoseToolError("public_key_missing");
    if (publicBytes.length !== sizes[algorithm.curve])
      throw new JoseToolError("invalid_key");
    return {
      kty: "OKP",
      crv: algorithm.curve,
      d: url64(raw),
      x: url64(publicBytes),
    };
  }
  try {
    const key = await crypto.subtle.importKey(
      privateKey ? "pkcs8" : "spki",
      bytes(root).buffer,
      algorithm.algorithm,
      true,
      privateKey
        ? [algorithm.type === "RSA" ? "decrypt" : "sign"]
        : [algorithm.type === "RSA" ? "encrypt" : "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", key);
    // PEM encodes key material, not the temporary import algorithm or usages.
    delete jwk.alg;
    delete jwk.key_ops;
    delete jwk.ext;
    return jwk;
  } catch {
    throw new JoseToolError("invalid_key");
  }
}
export async function pemToJwk(input: string, pretty = true) {
  bounded(input);
  const matches = Array.from(
    input.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g),
  );
  const keys: JsonWebKey[] = [],
    warnings: string[] = [];
  if (matches.length > 100) throw new JoseToolError("too_large");
  if (matches.length === 0) {
    keys.push(await derToJwk(fromBase64(input.trim()), "DER"));
  } else {
    const outside = input
      .replace(/-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?-----END \1-----/g, "")
      .trim();
    if (outside) warnings.push("unrecognized_text");
    for (const match of matches) {
      try {
        keys.push(await derToJwk(fromBase64(match[2]), match[1]));
      } catch (e) {
        warnings.push(e instanceof JoseToolError ? e.code : "invalid_pem");
      }
    }
  }
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  if (keys.length === 0) throw new JoseToolError(warnings[0]!);
  return {
    output: JSON.stringify(
      keys.length === 1 ? keys[0] : { keys },
      null,
      pretty ? 2 : undefined,
    ),
    warnings,
  };
}
