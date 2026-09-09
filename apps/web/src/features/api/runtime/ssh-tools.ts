import * as z from "zod/v4";
import type { SshJob } from "@/features/tools/ssh-tools/jobs";
import { MAX_SSH_INPUT, SshError } from "@workspace/tools/crypto/ssh";
import {
  runSsh,
  sshGeneratedSchema as generated,
  sshFingerprintSchema as fingerprinted,
} from "@/features/tools/ssh-tools/worker-client";
import { resolveSource } from "./legacy-hashes";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const sshGenerateSchema = z.strictObject({
  algorithm: z.enum(["ed25519", "rsa"]).default("ed25519"),
  rsaSize: z
    .union([z.literal(2048), z.literal(3072), z.literal(4096)])
    .default(4096),
  comment: z.string().max(4096).default(""),
});
const text = z.strictObject({ text: z.string().max(MAX_SSH_INPUT) });
const upload = z.strictObject({ uploadId: z.uuid() });
export const sshFingerprintSchema = z.union([
  text,
  upload,
  z.strictObject({ inputPath: z.string().min(1).max(4096) }),
]);
export const sshFingerprintHttpSchema = z.union([text, upload]);
let active = 0;
async function execute(job: SshJob, signal: AbortSignal) {
  signal.throwIfAborted();
  if (active >= 2) throw new SshError("busy");
  active++;
  try {
    return await runSsh(
      job,
      signal,
      import.meta.env.PROD
        ? () =>
            new Worker(serviceWorkerUrl("ssh-tools-worker", import.meta.url), {
              type: "module",
            })
        : undefined,
    );
  } finally {
    active--;
  }
}
export const sshOperations: Operation[] = [
  {
    id: "ssh-key-generator",
    name: "tooltab_ssh_key_generator",
    description:
      "Generate a secure random Ed25519 or RSA 2048/3072/4096 key pair locally, returning unencrypted OpenSSH private/public keys and SHA256 fingerprint. No automatic persistence. Keep returned private material secret.",
    inputSchema: sshGenerateSchema,
    outputSchema: generated,
    bodyLimit: 32000,
    idempotent: false,
    async run(value, signal) {
      const p = sshGenerateSchema.parse(value);
      return generated.parse(
        await execute(
          { mode: "generate", options: p },
          signal ?? new AbortController().signal,
        ),
      );
    },
  },
  {
    id: "ssh-public-key-fingerprint",
    name: "tooltab_ssh_public_key_fingerprint",
    description:
      "Parse up to 8MiB UTF8 OpenSSH/authorized_keys/RFC4716 public key text, an upload, or authorized MCP path. Returns SHA256/MD5 fingerprints and key details, preserving invalid entries as line errors. Unknown key types have detailsChecked=false. Fingerprints do not prove ownership or trust.",
    inputSchema: sshFingerprintSchema,
    outputSchema: fingerprinted,
    bodyLimit: 51000000,
    idempotent: true,
    async run(value, signal, context) {
      const p = sshFingerprintSchema.parse(value),
        abort = signal ?? new AbortController().signal;
      abort.throwIfAborted();
      let input: string;
      if ("text" in p) input = p.text;
      else {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        const pieces: string[] = [];
        try {
          for await (const chunk of resolveSource(p, abort, context)) {
            abort.throwIfAborted();
            bytes += chunk.length;
            if (bytes > MAX_SSH_INPUT) throw new SshError("too_large");
            pieces.push(decoder.decode(chunk, { stream: true }));
          }
          pieces.push(decoder.decode());
        } catch (e) {
          if (e instanceof TypeError) throw new SshError("invalid_unicode");
          throw e;
        }
        input = pieces.join("");
      }
      return fingerprinted.parse(
        await execute({ mode: "fingerprint", input }, abort),
      );
    },
  },
];
