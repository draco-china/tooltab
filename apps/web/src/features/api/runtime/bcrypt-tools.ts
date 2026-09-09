import * as z from "zod/v4";
import {
  BcryptError,
  DEFAULT_COST,
  MIN_COST,
  MAX_COST,
} from "@workspace/tools/crypto/bcrypt";
import { runBcrypt } from "@/features/tools/bcrypt/worker-client";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const common = {
  password: z.string().max(1048576),
  truncate: z.boolean().default(false),
};
export const bcryptHashSchema = z.strictObject({
  ...common,
  password: common.password.min(1),
  cost: z.number().int().min(MIN_COST).max(MAX_COST).default(DEFAULT_COST),
});
export const bcryptVerifySchema = z.strictObject({
  ...common,
  hash: z.string().min(1).max(256),
});
const output = z.strictObject({
  hash: z.string(),
  version: z.enum(["2a", "2b", "2y"]),
  cost: z.number().int(),
  salt: z.string(),
  checksum: z.string(),
  passwordBytes: z.number().int(),
  truncated: z.boolean(),
  matches: z.boolean().nullable(),
});
let active = 0;
export const bcryptToolOperations: Operation[] = [
  {
    id: "bcrypt-hash-password",
    name: "tooltab_bcrypt_hash_password",
    description:
      "Generate a genuine $2b$ bcrypt hash with WebCrypto salt and cost 4–15 (default12). Reject UTF-8 passwords above72bytes unless truncate explicitly true. No password persistence; cancellable Worker,120s resource budget.",
    inputSchema: bcryptHashSchema,
    outputSchema: output,
    bodyLimit: 6500000,
    idempotent: false,
    async run(value, context) {
      if (active >= 2) throw new BcryptError("busy");
      const input = bcryptHashSchema.parse(value);
      active++;
      try {
        return await runBcrypt(
          { kind: "hash", ...input },
          context ?? new AbortController().signal,
          import.meta.env.PROD
            ? () =>
                new Worker(serviceWorkerUrl("bcrypt-worker", import.meta.url), {
                  type: "module",
                })
            : undefined,
        );
      } finally {
        active--;
      }
    },
  },
  {
    id: "bcrypt-hash-password-verifier",
    name: "tooltab_bcrypt_hash_password_verifier",
    description:
      "Verify bcrypt $2a$/$2b$/$2y$ cost4–31. Empty passwords supported; UTF-8 above72bytes requires explicit truncate compatibility. Expensive costs may exceed120s Worker resource budget; timeout is not mismatch.",
    inputSchema: bcryptVerifySchema,
    outputSchema: output,
    bodyLimit: 6500000,
    idempotent: true,
    async run(value, context) {
      if (active >= 2) throw new BcryptError("busy");
      const input = bcryptVerifySchema.parse(value);
      active++;
      try {
        return await runBcrypt(
          { kind: "verify", ...input },
          context ?? new AbortController().signal,
          import.meta.env.PROD
            ? () =>
                new Worker(serviceWorkerUrl("bcrypt-worker", import.meta.url), {
                  type: "module",
                })
            : undefined,
        );
      } finally {
        active--;
      }
    },
  },
];
