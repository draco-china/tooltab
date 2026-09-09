import * as z from "zod/v4";
import { automationToolNames } from "../../../lib/automation-catalog";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  generateUuidV4,
  generateUuidV7,
  MAX_UUID_COUNT,
  uuidSentinel,
} from "@workspace/tools/uuid/generate";
export const uuidOperations: Operation[] = [
  ...(["uuid-v4-generator", "uuid-v4-bulk-generator"] as const).map(
    (id): Operation => {
      const inputSchema =
        id === "uuid-v4-generator"
          ? z.strictObject({})
          : z.strictObject({
              count: z.number().int().min(1).max(MAX_UUID_COUNT).default(10),
            });
      return {
        id,
        name: automationToolNames[id],
        description:
          id === "uuid-v4-generator"
            ? "Generate one cryptographically random RFC 9562 UUID v4 locally."
            : "Generate 1–1000 cryptographically random RFC 9562 UUID v4 values locally (default 10).",
        inputSchema,
        outputSchema: z.strictObject({ uuids: z.array(z.string()) }),
        bodyLimit: 4096,
        idempotent: false,
        run(input) {
          const args = inputSchema.parse(input);
          return {
            uuids: generateUuidV4("count" in args ? (args.count as number) : 1),
          };
        },
      };
    },
  ),
  ...(["nil", "max"] as const).map((kind): Operation => {
    const id = kind === "nil" ? "uuid-nil-generator" : "uuid-max-generator";
    const inputSchema = z.strictObject({});
    return {
      id,
      name: automationToolNames[id],
      description: `Return the RFC 9562 ${kind} UUID in canonical, compact hexadecimal and URN forms.`,
      inputSchema,
      outputSchema: z.strictObject({
        canonical: z.string(),
        hex: z.string(),
        urn: z.string(),
      }),
      bodyLimit: 4096,
      idempotent: true,
      run(input) {
        inputSchema.parse(input);
        return uuidSentinel(kind);
      },
    };
  }),
];

const v7InputSchema = z.strictObject({
  count: z.number().int().min(1).max(100).default(1),
  timestamp: z.number().int().min(0).max(281474976710655).optional(),
});
uuidOperations.push({
  id: "uuid-v7-generator",
  name: automationToolNames["uuid-v7-generator"],
  description:
    "Generate 1–100 RFC 9562 UUID v7 values with optional 48-bit Unix millisecond timestamp (default now). Values increase within one batch only, not across calls; UUIDs disclose the timestamp.",
  inputSchema: v7InputSchema,
  outputSchema: z.strictObject({
    values: z.array(z.string()),
    timestamp: z.number().int(),
  }),
  bodyLimit: 4096,
  idempotent: false,
  run(input) {
    const args = v7InputSchema.parse(input);
    return generateUuidV7(args.count, args.timestamp);
  },
});
