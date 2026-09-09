import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  convertTimeUuid,
  generateTimeUuid,
  MAX_TIME_MS,
  MIN_TIME_MS,
} from "@workspace/tools/uuid/time";

const inputSchema = z.strictObject({
  count: z.number().int().min(1).max(100).default(1),
  timestamp: z.number().int().min(MIN_TIME_MS).max(MAX_TIME_MS).optional(),
  tick: z.number().int().min(0).max(9999).default(0),
  node: z.string().max(17).optional(),
  sequence: z.number().int().min(0).max(16383).optional(),
});
export const uuidTimeOperations: Operation[] = [1, 6].map((version) => ({
  id: `uuid-v${version}-generator`,
  name: `tooltab_uuid_v${version}_generator`,
  description: `Generate UUID v${version} with optional Gregorian-range Unix milliseconds,100ns tick,node and 14-bit sequence. Omitted fields use current clock and secure randomness; repeated custom fields can duplicate output.`,
  inputSchema,
  outputSchema: z.strictObject({
    timestamp: z.number().int(),
    values: z.array(z.string()),
  }),
  bodyLimit: 4096,
  idempotent: false,
  run(input) {
    return generateTimeUuid({
      ...inputSchema.parse(input),
      version: version as 1 | 6,
    });
  },
}));
const converterSchema = z.strictObject({
  input: z.string().max(100),
  from: z.union([z.literal(1), z.literal(6)]),
});
uuidTimeOperations.push({
  id: "uuid-v1-v6-converter",
  name: "tooltab_uuid_v1_v6_converter",
  description:
    "Convert RFC-variant UUID v1/v6 layouts without losing timestamp,sequence or node bits.",
  inputSchema: converterSchema,
  outputSchema: z.strictObject({ v1: z.string(), v6: z.string() }),
  bodyLimit: 4096,
  idempotent: true,
  run(input) {
    const args = converterSchema.parse(input);
    return convertTimeUuid(args.input, args.from);
  },
});
