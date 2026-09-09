export const RSA_SIZES = [2048, 3072, 4096] as const;
export const HASHES = ["SHA-256", "SHA-384", "SHA-512"] as const;
export const CURVES = ["P-256", "P-384", "P-521"] as const;
export const SUBJECT_FIELDS = [
  "commonName",
  "organization",
  "organizationalUnit",
  "country",
  "state",
  "locality",
  "emailAddress",
] as const;
export const SAN_FIELDS = ["dns", "ip", "email", "uri"] as const;
export const MAX_CERT_INPUT = 8 * 1024 * 1024;
export class CertificateToolError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export type CsrOptions = {
  keySource: "generate" | "import";
  algorithm: "rsa" | "ecdsa";
  rsaSize: (typeof RSA_SIZES)[number];
  rsaHash: (typeof HASHES)[number];
  ecCurve: (typeof CURVES)[number];
  keyPem: string;
  subject: Record<(typeof SUBJECT_FIELDS)[number], string>;
  san: Record<(typeof SAN_FIELDS)[number], string[]>;
};
export type CsrResult = {
  csrPem: string;
  privateKeyPem: string | null;
  keyAlgorithm: string;
};
export type ParsedEntry = {
  index: number;
  type: "certificate" | "publicKey";
  label: string;
  subject: string | null;
  issuer: string | null;
  serialNumber: string | null;
  notBefore: string | null;
  notAfter: string | null;
  signatureAlgorithm: string | null;
  publicKeyAlgorithm: string;
  publicKeySize: number | null;
  publicKeyCurve: string | null;
  sha1: string;
  sha256: string;
  extensions: Record<string, string | number | boolean | string[]>;
};
export type ParseResult = {
  entries: ParsedEntry[];
  warnings: { index: number; label: string; code: string }[];
  trustChecked: false;
};
