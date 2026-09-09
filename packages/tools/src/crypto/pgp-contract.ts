import * as z from "zod/v4";
export const PGP_RSA_SIZES = [2048, 3072, 4096] as const;
export const MAX_EXPIRATION_DAYS = 36500;
export type PgpOptions = {
  name: string;
  email: string;
  comment: string;
  passphrase: string;
  algorithm: "ecc" | "rsa";
  rsaSize: (typeof PGP_RSA_SIZES)[number];
  expirationDays: number;
};
export type PgpResult = {
  publicKey: string;
  privateKey: string;
  revocationCertificate: string;
  fingerprint: string;
  keyID: string;
  userID: string;
  passphraseProtected: boolean;
  createdAt: string;
  expiresAt: string | null;
  legacyExpiryOverflow: boolean;
};
export class PgpToolError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const pgpKeySchema = z.strictObject({
  name: z.string().max(4096).default(""),
  email: z.string().max(4096).default(""),
  comment: z.string().max(4096).default(""),
  passphrase: z.string().max(65536).default(""),
  algorithm: z.enum(["ecc", "rsa"]).default("ecc"),
  rsaSize: z
    .union([z.literal(2048), z.literal(3072), z.literal(4096)])
    .default(4096),
  expirationDays: z.number().int().min(0).max(MAX_EXPIRATION_DAYS).default(0),
});
