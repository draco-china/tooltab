import { fingerprintBytes } from "./fingerprint";
import "reflect-metadata";
import * as x509 from "@peculiar/x509";
import * as asn from "asn1js";
import { formatIp, parseIp } from "../network/cidr";
import { base64, fromBase64 } from "./jose-common";
import {
  type CsrOptions,
  type CsrResult,
  CURVES,
  CertificateToolError as Fail,
  HASHES,
  MAX_CERT_INPUT,
  type ParsedEntry,
  type ParseResult,
  RSA_SIZES,
  SAN_FIELDS,
  SUBJECT_FIELDS,
} from "./certificate-contract";

const limits = {
  maxDepth: 32,
  maxNodes: 10000,
  maxContentLength: MAX_CERT_INPUT,
};
const options = { berOptions: limits };
function checkedText(value: string, max = MAX_CERT_INPUT) {
  if (value.length > max || new TextEncoder().encode(value).length > max)
    throw new Fail("too_large");
  if (/[\uD800-\uDFFF]/u.test(value)) throw new Fail("invalid_unicode");
  return value;
}
// Callers pass bounded input, decoded base64, or a slice of bounded DER.
function decode(bytes: Uint8Array) {
  const p = asn.fromBER(bytes, limits);
  if (
    p.offset !== bytes.length ||
    p.result.error ||
    !(p.result instanceof asn.Sequence)
  )
    throw new Fail("invalid_der");
  return p.result;
}
function b64(value: string) {
  try {
    return fromBase64(value);
  } catch {
    throw new Fail("invalid_pem");
  }
}
function pem(label: string, data: ArrayBuffer) {
  return `-----BEGIN ${label}-----\n${base64(new Uint8Array(data))
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END ${label}-----\n`;
}
const curveHashes = {
  "P-256": "SHA-256",
  "P-384": "SHA-384",
  "P-521": "SHA-512",
} as const;
const curveOids: Record<string, (typeof CURVES)[number]> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
};
async function keys(p: CsrOptions) {
  if (
    !RSA_SIZES.includes(p.rsaSize) ||
    !HASHES.includes(p.rsaHash) ||
    !CURVES.includes(p.ecCurve)
  )
    throw new Fail("invalid_options");
  let alg: RsaHashedKeyGenParams | EcKeyGenParams;
  if (p.keySource === "generate") {
    if (p.algorithm === "rsa")
      alg = {
        name: "RSASSA-PKCS1-v1_5",
        hash: p.rsaHash,
        modulusLength: p.rsaSize,
        publicExponent: new Uint8Array([1, 0, 1]),
      };
    else if (p.algorithm === "ecdsa")
      alg = { name: "ECDSA", namedCurve: p.ecCurve };
    else throw new Fail("invalid_options");
    const pair = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    return {
      pair,
      hash: p.algorithm === "rsa" ? p.rsaHash : curveHashes[p.ecCurve],
      label:
        p.algorithm === "rsa"
          ? `RSA ${p.rsaSize} / ${p.rsaHash}`
          : `ECDSA ${p.ecCurve}`,
    };
  }
  if (p.keySource !== "import") throw new Fail("invalid_options");
  const input = checkedText(p.keyPem, 1048576).trim();
  if (!input) throw new Fail("missing_key");
  if (input.includes("ENCRYPTED PRIVATE KEY")) throw new Fail("encrypted_key");
  if (input.includes("RSA PRIVATE KEY") || input.includes("EC PRIVATE KEY"))
    throw new Fail("legacy_key");
  const block =
    /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----$/.exec(
      input,
    );
  if (!block) throw new Fail("invalid_pem");
  const data = b64(block[1]),
    root = decode(data),
    fields = root.valueBlock.value;
  if (
    !(fields[0] instanceof asn.Integer) ||
    fields[0].valueBlock.valueDec !== 0 ||
    !(fields[1] instanceof asn.Sequence) ||
    !(fields[2] instanceof asn.OctetString)
  )
    throw new Fail("invalid_pem");
  const ids = fields[1].valueBlock.value;
  if (!(ids[0] instanceof asn.ObjectIdentifier)) throw new Fail("invalid_pem");
  const oid = ids[0].valueBlock.toString();
  let importAlg: RsaHashedImportParams | EcKeyImportParams,
    hash: (typeof HASHES)[number];
  if (oid === "1.2.840.113549.1.1.1") {
    const rsa = decode(fields[2].valueBlock.valueHexView).valueBlock.value;
    if (!(rsa[1] instanceof asn.Integer)) throw new Fail("invalid_pem");
    const modulus = rsa[1].valueBlock.valueHexView;
    let offset = 0;
    while (offset < modulus.length && modulus[offset] === 0) offset++;
    const bits =
      offset === modulus.length
        ? 0
        : (modulus.length - offset - 1) * 8 + 32 - Math.clz32(modulus[offset]);
    if (bits < 1024 || bits > 16384) throw new Fail("unsupported_key");
    importAlg = { name: "RSASSA-PKCS1-v1_5", hash: p.rsaHash };
    hash = p.rsaHash;
  } else if (
    oid === "1.2.840.10045.2.1" &&
    ids[1] instanceof asn.ObjectIdentifier
  ) {
    const curve = curveOids[ids[1].valueBlock.toString()];
    if (!curve) throw new Fail("unsupported_key");
    importAlg = { name: "ECDSA", namedCurve: curve };
    hash = curveHashes[curve];
  } else throw new Fail("unsupported_key");
  try {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      data.slice().buffer,
      importAlg,
      true,
      ["sign"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicJwk: JsonWebKey = {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    };
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      importAlg,
      true,
      ["verify"],
    );
    const size =
      "modulusLength" in privateKey.algorithm
        ? Number(privateKey.algorithm.modulusLength)
        : null;
    if (size !== null && (size < 1024 || size > 16384))
      throw new Fail("unsupported_key");
    return {
      pair: { publicKey, privateKey },
      hash,
      label: size ? `RSA ${size} / ${hash}` : `ECDSA ${jwk.crv}`,
    };
  } catch (e) {
    if (e instanceof Fail) throw e;
    throw new Fail("import_failed");
  }
}
export async function generateCsr(p: CsrOptions): Promise<CsrResult> {
  const subject: Record<string, string[]> = {},
    names: x509.GeneralName[] = [];
  const subjectIds = {
    commonName: "CN",
    organization: "O",
    organizationalUnit: "OU",
    country: "C",
    state: "ST",
    locality: "L",
    emailAddress: "1.2.840.113549.1.9.1",
  };
  for (const field of SUBJECT_FIELDS) {
    const v = checkedText(p.subject[field], 4096).trim();
    if (v) {
      if (
        Array.from(v).some(
          (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
        )
      )
        throw new Fail("invalid_subject");
      if (field === "country" && !/^[A-Za-z]{2}$/.test(v))
        throw new Fail("invalid_subject");
      if (field === "emailAddress" && !/^[\x20-\x7e]+$/.test(v))
        throw new Fail("invalid_subject");
      subject[subjectIds[field]] = [field === "country" ? v.toUpperCase() : v];
    }
  }
  let count = 0;
  for (const field of SAN_FIELDS) {
    for (const raw of p.san[field]) {
      let v = checkedText(raw, 4096).trim();
      if (!v) continue;
      if (++count > 1000) throw new Fail("too_large");
      if (field === "ip") {
        try {
          const ip = parseIp(v);
          if (
            !v.includes(":") &&
            v.split(".").some((x) => x.length > 1 && x.startsWith("0"))
          )
            throw new Error();
          v = formatIp(ip.value, ip.family);
        } catch {
          throw new Fail("invalid_ip");
        }
      } else if (!/^[\x21-\x7e]+$/.test(v)) throw new Fail("invalid_san");
      names.push(new x509.GeneralName(field === "uri" ? "url" : field, v));
    }
  }
  if (!Object.keys(subject).length && !names.length)
    throw new Fail("missing_subject");
  try {
    const key = await keys(p);
    const csr = await x509.Pkcs10CertificateRequestGenerator.create(
      {
        name: Object.keys(subject).length ? [subject] : undefined,
        keys: key.pair,
        signingAlgorithm: {
          name: key.pair.privateKey.algorithm.name,
          hash: key.hash,
        },
        extensions: names.length
          ? [new x509.SubjectAlternativeNameExtension(names)]
          : undefined,
      },
      crypto,
    );
    return {
      csrPem: csr.toString("pem"),
      privateKeyPem:
        p.keySource === "generate"
          ? pem(
              "PRIVATE KEY",
              await crypto.subtle.exportKey("pkcs8", key.pair.privateKey),
            )
          : null,
      keyAlgorithm: key.label,
    };
  } catch (e) {
    if (e instanceof Fail) throw e;
    throw new Fail("generation_failed");
  }
}
const hexText = (s: string) => s.replace(/(..)(?=.)/g, "$1:").toUpperCase();
function algorithm(a: Algorithm) {
  const v = a as Algorithm & { hash?: Algorithm };
  return v.hash ? `${v.name} (${v.hash.name})` : v.name;
}
async function parseDer(
  data: Uint8Array,
  index: number,
  label: string,
  kind?: "certificate" | "publicKey",
): Promise<ParsedEntry> {
  decode(data);
  let cert: x509.X509Certificate | null = null,
    key: x509.PublicKey;
  if (kind !== "publicKey") {
    try {
      cert = new x509.X509Certificate(data.slice().buffer, options);
    } catch {
      if (kind === "certificate") throw new Fail("invalid_der");
    }
  }
  try {
    key = cert
      ? cert.publicKey
      : new x509.PublicKey(data.slice().buffer, options);
  } catch {
    throw new Fail("invalid_der");
  }
  const alg = key.algorithm as Algorithm & {
    modulusLength?: number;
    namedCurve?: string;
  };
  const extensions: ParsedEntry["extensions"] = {};
  if (cert) {
    const san = cert.getExtension(x509.SubjectAlternativeNameExtension);
    if (san)
      extensions.subjectAlternativeNames = san.names.items.map(
        (n) => `${n.type}: ${n.value}`,
      );
    const ku = cert.getExtension(x509.KeyUsagesExtension);
    if (ku)
      extensions.keyUsage = Object.entries(x509.KeyUsageFlags)
        .filter(
          ([k, v]) =>
            typeof v === "number" && (ku.usages & v) === v && !/^\d/.test(k),
        )
        .map(([k]) => k);
    const eku = cert.getExtension(x509.ExtendedKeyUsageExtension);
    if (eku) extensions.extendedKeyUsage = eku.usages.map(String);
    const bc = cert.getExtension(x509.BasicConstraintsExtension);
    if (bc) {
      extensions.ca = bc.ca;
      if (bc.pathLength !== undefined) extensions.pathLength = bc.pathLength;
    }
    const ski = cert.getExtension(x509.SubjectKeyIdentifierExtension);
    if (ski) extensions.subjectKeyIdentifier = hexText(ski.keyId);
    const aki = cert.getExtension(x509.AuthorityKeyIdentifierExtension);
    if (aki?.keyId) extensions.authorityKeyIdentifier = hexText(aki.keyId);
  }
  const raw = cert ? cert.rawData : key.rawData;
  return {
    index,
    type: cert ? "certificate" : "publicKey",
    label,
    subject: cert?.subject ?? null,
    issuer: cert?.issuer ?? null,
    serialNumber: cert ? hexText(cert.serialNumber) : null,
    notBefore: cert?.notBefore.toISOString() ?? null,
    notAfter: cert?.notAfter.toISOString() ?? null,
    signatureAlgorithm: cert ? algorithm(cert.signatureAlgorithm) : null,
    publicKeyAlgorithm: algorithm(alg),
    publicKeySize: alg.modulusLength ?? null,
    publicKeyCurve: alg.namedCurve ?? null,
    ...(await fingerprintBytes(raw)),
    extensions,
  };
}

export type CertificateParserInputWarning = Readonly<{
  label: string;
  code: "unsupported_block" | "parse_failed";
}>;

export type CertificateParserInputResult = Readonly<{
  entries: Array<ParsedEntry & { ordinal: number }>;
  warnings: Array<CertificateParserInputWarning>;
}>;

function parserBase64(value: string, code: "invalid_input" | "invalid_pem") {
  try {
    return Uint8Array.from(atob(value.replace(/\s+/g, "")), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new Fail(code);
  }
}

async function parseParserDer(
  data: Uint8Array,
  index: number,
  label: string,
  kind?: "certificate" | "publicKey",
) {
  if (data.length > MAX_CERT_INPUT) throw new Fail("too_large");
  try {
    return await parseDer(data, index, label, kind);
  } catch (error) {
    if (
      !globalThis.crypto?.subtle &&
      (error instanceof TypeError || error instanceof ReferenceError)
    )
      throw new Fail("webcrypto_unavailable");
    throw error;
  }
}

/**
 * Parses the certificate-page input format without changing the protocol parser.
 * It intentionally preserves the page's permissive PEM labels and invalid-block
 * recovery behavior.
 */
export async function parseCertificateParserInput(
  input: string | Uint8Array,
): Promise<CertificateParserInputResult> {
  if (typeof input !== "string") {
    return {
      entries: [{ ...(await parseParserDer(input, 1, "DER")), ordinal: 1 }],
      warnings: [],
    };
  }

  const value = input.trim();
  if (!value) return { entries: [], warnings: [] };
  if (!value.includes("-----BEGIN")) {
    const cleaned = value.replace(/\s+/g, "");
    if (!cleaned || !/^[A-Za-z0-9+/=]+$/.test(cleaned))
      throw new Fail("invalid_input");
    return {
      entries: [
        {
          ...(await parseParserDer(
            parserBase64(cleaned, "invalid_input"),
            1,
            "DER",
          )),
          ordinal: 1,
        },
      ],
      warnings: [],
    };
  }

  const entries: CertificateParserInputResult["entries"] = [];
  const warnings: CertificateParserInputResult["warnings"] = [];
  const pattern = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
  let decodedBlocks = 0;
  let certificateOrdinal = 0;
  let publicKeyOrdinal = 0;

  for (const match of value.matchAll(pattern)) {
    const label = match[1]?.trim();
    const body = match[2]?.replace(/[\r\n\s]/g, "");
    if (!label || !body) continue;

    let data: Uint8Array;
    try {
      data = parserBase64(body, "invalid_pem");
    } catch {
      // Invalid PEM blocks are ignored so another block can still succeed.
      continue;
    }
    decodedBlocks += 1;
    const normalized = label.toUpperCase();
    const kind =
      normalized.includes("CERTIFICATE") && !normalized.includes("REQUEST")
        ? "certificate"
        : normalized === "PUBLIC KEY"
          ? "publicKey"
          : undefined;
    if (!kind) {
      warnings.push({ label, code: "unsupported_block" });
      continue;
    }
    const ordinal =
      kind === "certificate" ? ++certificateOrdinal : ++publicKeyOrdinal;
    try {
      entries.push({
        ...(await parseParserDer(data, decodedBlocks, label, kind)),
        ordinal,
      });
    } catch (error) {
      if (error instanceof Fail && error.code === "webcrypto_unavailable")
        throw error;
      warnings.push({ label, code: "parse_failed" });
    }
  }
  if (!decodedBlocks) throw new Fail("invalid_pem");
  return { entries, warnings };
}

export async function parseCertificates(
  input: string | Uint8Array,
): Promise<ParseResult> {
  const result: ParseResult = {
    entries: [],
    warnings: [],
    trustChecked: false,
  };
  let value: string;
  if (typeof input !== "string") {
    if (input.length > MAX_CERT_INPUT) throw new Fail("too_large");
    const preview = new TextDecoder().decode(input.subarray(0, 2048));
    if (!preview.includes("-----BEGIN")) {
      result.entries.push(await parseDer(input, 1, "DER"));
      return result;
    }
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      throw new Fail("invalid_unicode");
    }
  } else value = checkedText(input);
  value = value.trim();
  if (!value) return result;
  if (!value.includes("-----BEGIN")) {
    result.entries.push(await parseDer(b64(value), 1, "DER"));
    return result;
  }
  const pattern = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let count = 0,
    last = 0;
  for (const block of value.matchAll(pattern)) {
    if (++count > 1000) throw new Fail("too_large");
    if (value.slice(last, block.index).trim())
      result.warnings.push({
        index: count,
        label: "",
        code: "unrecognized_text",
      });
    last = block.index + block[0].length;
    const label = block[1];
    if (
      label !== "CERTIFICATE" &&
      label !== "X509 CERTIFICATE" &&
      label !== "TRUSTED CERTIFICATE" &&
      label !== "PUBLIC KEY"
    ) {
      result.warnings.push({ index: count, label, code: "unsupported_block" });
      continue;
    }
    try {
      result.entries.push(
        await parseDer(
          b64(block[2]),
          count,
          label,
          label === "PUBLIC KEY" ? "publicKey" : "certificate",
        ),
      );
    } catch (e) {
      result.warnings.push({
        index: count,
        label,
        code: e instanceof Fail ? e.code : "invalid_der",
      });
    }
  }
  if (value.slice(last).trim())
    result.warnings.push({
      index: count + 1,
      label: "",
      code: "unrecognized_text",
    });
  if (!count) throw new Fail("invalid_pem");
  return result;
}
