import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  convertUuid,
  inspectUuid,
  UUID_FORMATS,
  UuidInspectionError,
} from "@workspace/tools/uuid/inspect";
export const uuidRepresentationSchema = z.strictObject({
  uuid: z.string(),
  hex: z.string(),
  base64: z.string(),
  decimal: z.string(),
  octal: z.string(),
  binary: z.string(),
});
export const uuidInspectionSchema = z.strictObject({
  representations: uuidRepresentationSchema,
  version: z.number().int(),
  special: z.enum(["nil", "max"]).nullable(),
  variant: z.enum(["ncs", "rfc", "microsoft", "future"]),
  supportedVersion: z.boolean(),
  supportedVariant: z.boolean(),
  valid: z.boolean(),
  segments: z.array(z.string()).length(5),
  time: z
    .strictObject({
      unixMilliseconds: z.string(),
      utc: z.string(),
      subMillisecondTicks: z.number().int().optional(),
    })
    .nullable(),
  node: z
    .strictObject({
      identifier: z.string(),
      multicast: z.boolean(),
      clockSequence: z.number().int(),
    })
    .nullable(),
  algorithm: z.enum(["MD5", "SHA-1"]).nullable(),
});
const inputSchema = z.strictObject({ input: z.string().max(100) });
const convertSchema = z.strictObject({
  input: z.string().max(512),
  format: z.enum(UUID_FORMATS),
});
export const uuidInspectorOperations: Operation[] = [
  {
    id: "uuid-validator",
    name: "tooltab_uuid_validator",
    description:
      "Validate canonical UUID syntax, versions 1–8 and RFC variant; accepts nil/max special values. Does not prove uniqueness.",
    inputSchema,
    outputSchema: z.strictObject({
      valid: z.boolean(),
      error: z.literal("invalid_uuid").nullable(),
      details: uuidInspectionSchema.nullable(),
    }),
    bodyLimit: 4096,
    idempotent: true,
    run(input) {
      const args = inputSchema.parse(input);
      try {
        const details = inspectUuid(args.input, true);
        return { valid: details.valid, error: null, details };
      } catch (e) {
        if (e instanceof UuidInspectionError)
          return { valid: false, error: e.code, details: null };
        throw e;
      }
    },
  },
  {
    id: "uuid-decoder",
    name: "tooltab_uuid_decoder",
    description:
      "Decode canonical, URN, braced or compact UUIDs; return exact numeric representations and applicable RFC v1/v6/v7 timestamps. Unknown layouts have no inferred timestamps.",
    inputSchema,
    outputSchema: uuidInspectionSchema,
    bodyLimit: 4096,
    idempotent: true,
    run(input) {
      return inspectUuid(inputSchema.parse(input).input);
    },
  },
  {
    id: "uuid-base64-hex-decimal-octal-binary-converter",
    name: "tooltab_uuid_base64_hex_decimal_octal_binary_converter",
    description:
      "Convert a UUID or raw-byte Base64/hex/decimal/octal/binary representation using lossless unsigned 128-bit arithmetic.",
    inputSchema: convertSchema,
    outputSchema: uuidRepresentationSchema,
    bodyLimit: 4096,
    idempotent: true,
    run(input) {
      const args = convertSchema.parse(input);
      return convertUuid(args.input, args.format);
    },
  },
];
