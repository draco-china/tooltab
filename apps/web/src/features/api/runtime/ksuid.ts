import * as z from "zod/v4";
import type { Operation } from "./operation-contract";
import { EPOCH, generate, MAX_TIME } from "@workspace/tools/id/ksuid";
export const ksuidSchema = z.strictObject({
  count: z.number().int().min(1).max(100).default(5),
  timestamp: z
    .number()
    .min(EPOCH)
    .lt(MAX_TIME + 1)
    .optional(),
});
export const ksuidOperation: Operation = {
  id: "ksuid-generator",
  name: "tooltab_ksuid_generator",
  description:
    "Generate 1–100 KSUIDs with secure 128-bit payloads and current or custom Unix seconds. Fractional seconds are floored; timestamps are not proof of real creation time.",
  inputSchema: ksuidSchema,
  outputSchema: z.strictObject({
    ids: z
      .array(z.string().regex(/^[0-9A-Za-z]{27}$/))
      .min(1)
      .max(100),
    count: z.number().int().min(1).max(100),
    timestamp: z.number().int().min(EPOCH).max(MAX_TIME),
  }),
  bodyLimit: 4096,
  idempotent: false,
  run(input, signal) {
    signal?.throwIfAborted();
    const args = ksuidSchema.parse(input);
    return generate(args.count, args.timestamp);
  },
};
