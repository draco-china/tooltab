import * as z from "zod/v4";
import {
  csrResultSchema as generated,
  parseResultSchema as parsed,
  type CertificateJob,
} from "@/features/tools/certificate-tools/jobs";
import {
  CertificateToolError,
  CURVES,
  HASHES,
  MAX_CERT_INPUT,
} from "@workspace/tools/crypto/certificate-contract";
import { runCertificate } from "@/features/tools/certificate-tools/worker-client";
import { resolveSource } from "./legacy-hashes";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const field = z.string().max(4096).default("");
export const csrSchema = z.strictObject({
  keySource: z.enum(["generate", "import"]).default("generate"),
  algorithm: z.enum(["rsa", "ecdsa"]).default("rsa"),
  rsaSize: z
    .union([z.literal(2048), z.literal(3072), z.literal(4096)])
    .default(2048),
  rsaHash: z.enum(HASHES).default("SHA-256"),
  ecCurve: z.enum(CURVES).default("P-256"),
  keyPem: z.string().max(1048576).default(""),
  subject: z
    .strictObject({
      commonName: field,
      organization: field,
      organizationalUnit: field,
      country: field,
      state: field,
      locality: field,
      emailAddress: field,
    })
    .default({
      commonName: "example.com",
      organization: "",
      organizationalUnit: "",
      country: "",
      state: "",
      locality: "",
      emailAddress: "",
    }),
  san: z
    .strictObject({
      dns: z.array(z.string().max(4096)).max(1000).default([]),
      ip: z.array(z.string().max(4096)).max(1000).default([]),
      email: z.array(z.string().max(4096)).max(1000).default([]),
      uri: z.array(z.string().max(4096)).max(1000).default([]),
    })
    .default({ dns: [], ip: [], email: [], uri: [] }),
});
const text = z.strictObject({ text: z.string().max(MAX_CERT_INPUT) }),
  upload = z.strictObject({ uploadId: z.uuid() });
export const certificateParseSchema = z.union([
  text,
  upload,
  z.strictObject({ inputPath: z.string().min(1).max(4096) }),
]);
export const certificateParseHttpSchema = z.union([text, upload]);
let active = 0;
async function execute(job: CertificateJob, signal: AbortSignal) {
  signal.throwIfAborted();
  if (active >= 2) throw new CertificateToolError("busy");
  active++;
  try {
    return await runCertificate(
      job,
      signal,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("certificate-tools-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    );
  } finally {
    active--;
  }
}
export const certificateOperations: Operation[] = [
  {
    id: "csr-generator",
    name: "tooltab_csr_generator",
    description:
      "Create PKCS10 CSR locally with generated RSA2048/3072/4096 or ECDSA P256/384/521, or imported unencrypted PKCS8. All subject fields and DNS/IP/email/URI SANs. Returns generated private key only for generate mode; never stores secrets. A CSR is not an issued certificate.",
    inputSchema: csrSchema,
    outputSchema: generated,
    idempotent: false,
    bodyLimit: 32000000,
    async run(value, signal) {
      return generated.parse(
        await execute(
          { mode: "generate", options: csrSchema.parse(value) },
          signal ?? new AbortController().signal,
        ),
      );
    },
  },
  {
    id: "certificate-public-key-parser",
    name: "tooltab_certificate_public_key_parser",
    description:
      "Inspect up to8MiB PEM or Base64 DER text, binary DER upload or authorized MCP file. Up to1000 certificate/SPKI blocks, full certificate fields, SHA1/SHA256 fingerprints and SAN/KU/EKU/basic constraints/SKI/AKI. Mixed invalid blocks retain warnings. Does not verify signature, trust chain or revocation.",
    inputSchema: certificateParseSchema,
    outputSchema: parsed,
    idempotent: true,
    bodyLimit: 51000000,
    async run(value, signal, context) {
      const p = certificateParseSchema.parse(value),
        abort = signal ?? new AbortController().signal;
      abort.throwIfAborted();
      let input: string | Uint8Array;
      if ("text" in p) input = p.text;
      else {
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for await (const chunk of resolveSource(p, abort, context)) {
          abort.throwIfAborted();
          bytes += chunk.length;
          if (bytes > MAX_CERT_INPUT)
            throw new CertificateToolError("too_large");
          chunks.push(chunk.slice());
        }
        input = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          input.set(chunk, offset);
          offset += chunk.length;
        }
      }
      return parsed.parse(await execute({ mode: "parse", input }, abort));
    },
  },
];
