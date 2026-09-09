import * as z from "zod/v4";
import { ArgonError, randomSalt } from "@workspace/tools/crypto/argon2";
import { runArgon } from "@/features/tools/argon2/worker-client";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const common = {
  password: z.string().max(1048576),
  secret: z.string().max(1048576).default(""),
};
export const argonHashSchema = z.strictObject({
  ...common,
  password: common.password.min(1),
  algorithm: z.enum(["argon2id", "argon2i", "argon2d"]).default("argon2id"),
  salt: z.string().min(1).max(100000).optional(),
  iterations: z.number().int().min(1).max(12).default(3),
  memorySize: z.number().int().min(8).max(262144).default(65536),
  parallelism: z.number().int().min(1).max(16).default(1),
  hashLength: z.number().int().min(4).max(64).default(32),
});
export const argonVerifySchema = z.strictObject({
  ...common,
  hash: z.string().min(1).max(200000),
});
const output = z.strictObject({
  hash: z.string(),
  algorithm: z.enum(["argon2id", "argon2i", "argon2d"]),
  version: z.literal(19),
  iterations: z.number().int(),
  memorySize: z.number().int(),
  parallelism: z.number().int(),
  saltLength: z.number().int(),
  hashLength: z.number().int(),
  matches: z.boolean().nullable(),
});
let active = false;
export const argonToolOperations: Operation[] = [
  {
    id: "argon2-hash-password",
    name: "tooltab_argon2_hash_password",
    description:
      "Generate Argon2id/i/d v19 PHC from password, optional Base64 salt (omit for secure random16bytes) and optional secret pepper; m8–262144KiB,t1–12,p1–16,hash4–64bytes. Memory>=8*p. Local Worker120s budget, no input storage.",
    inputSchema: argonHashSchema,
    outputSchema: output,
    bodyLimit: 13000000,
    idempotent: false,
    async run(value, signal) {
      if (active) throw new ArgonError("busy");
      const input = argonHashSchema.parse(value);
      active = true;
      try {
        return await runArgon(
          { kind: "hash", ...input, salt: input.salt ?? randomSalt() },
          signal ?? new AbortController().signal,
          import.meta.env.PROD
            ? () =>
                new Worker(serviceWorkerUrl("argon2-worker", import.meta.url), {
                  type: "module",
                })
            : undefined,
        );
      } finally {
        active = false;
      }
    },
  },
  {
    id: "argon2-hash-password-verifier",
    name: "tooltab_argon2_hash_password_verifier",
    description:
      "Verify strict Argon2id/i/d v19 PHC with optional secret. Reject m>256MiB,t>12,p>16,digest>1024bytes before allocation; Worker120s budget. Empty passwords supported. Timeout/error is distinct from mismatch.",
    inputSchema: argonVerifySchema,
    outputSchema: output,
    bodyLimit: 13000000,
    idempotent: true,
    async run(value, signal) {
      if (active) throw new ArgonError("busy");
      const input = argonVerifySchema.parse(value);
      active = true;
      try {
        return await runArgon(
          { kind: "verify", ...input },
          signal ?? new AbortController().signal,
          import.meta.env.PROD
            ? () =>
                new Worker(serviceWorkerUrl("argon2-worker", import.meta.url), {
                  type: "module",
                })
            : undefined,
        );
      } finally {
        active = false;
      }
    },
  },
];
