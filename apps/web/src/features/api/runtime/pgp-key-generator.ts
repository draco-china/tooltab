import * as z from "zod/v4";
import {
  pgpKeySchema,
  PgpToolError,
} from "@workspace/tools/crypto/pgp-contract";
import { runPgp } from "@/features/tools/pgp-key-generator/worker-client";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const output = z.strictObject({
  publicKey: z.string(),
  privateKey: z.string(),
  revocationCertificate: z.string(),
  fingerprint: z.string(),
  keyID: z.string(),
  userID: z.string(),
  passphraseProtected: z.boolean(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  legacyExpiryOverflow: z.boolean(),
});
let active = 0;
export const pgpKeyOperation: Operation = {
  id: "pgp-key-generator",
  name: "tooltab_pgp_key_generator",
  description:
    "Generate OpenPGP v4 keys locally: legacy Curve25519 (Ed25519 signing primary and Curve25519 encryption subkey) or RSA2048/3072/4096. One name/email identity, optional exact passphrase, expiration0..36500days. Returns armored public/private keys, revocation certificate and identifiers. Never persists secrets; empty passphrase means unencrypted private key. Save revocation separately.",
  inputSchema: pgpKeySchema,
  outputSchema: output,
  idempotent: false,
  bodyLimit: 480000,
  async run(value, signal) {
    const p = pgpKeySchema.parse(value),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    if (active >= 2) throw new PgpToolError("busy");
    active++;
    try {
      return output.parse(
        await runPgp(
          p,
          abort,
          import.meta.env.PROD
            ? () =>
                new Worker(
                  serviceWorkerUrl("pgp-key-generator-worker", import.meta.url),
                  { type: "module" },
                )
            : undefined,
        ),
      );
    } finally {
      active--;
    }
  },
};
