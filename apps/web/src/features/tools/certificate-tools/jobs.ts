import { z } from "zod";
import type {
  CsrOptions,
  CsrResult,
  ParseResult,
} from "@workspace/tools/crypto/certificate-contract";
export type CsrJob = { mode: "generate"; options: CsrOptions };
export type CertificateJob =
  | CsrJob
  | { mode: "parse"; input: string | Uint8Array };
export type CertificateResult = CsrResult | ParseResult;

// Shared application output contract for Worker messages and public protocols.
export const csrResultSchema = z.strictObject({
  csrPem: z.string(),
  privateKeyPem: z.string().nullable(),
  keyAlgorithm: z.string(),
});
export const parseResultSchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      index: z.number().int(),
      type: z.enum(["certificate", "publicKey"]),
      label: z.string(),
      subject: z.string().nullable(),
      issuer: z.string().nullable(),
      serialNumber: z.string().nullable(),
      notBefore: z.string().nullable(),
      notAfter: z.string().nullable(),
      signatureAlgorithm: z.string().nullable(),
      publicKeyAlgorithm: z.string(),
      publicKeySize: z.number().nullable(),
      publicKeyCurve: z.string().nullable(),
      sha1: z.string(),
      sha256: z.string(),
      extensions: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      ),
    }),
  ),
  warnings: z.array(
    z.strictObject({
      index: z.number().int(),
      label: z.string(),
      code: z.string(),
    }),
  ),
  trustChecked: z.literal(false),
});
