import * as z from "zod/v4";
import { generateShortIds as generateCuid2Ids } from "@workspace/tools/id/cuid2";
import {
  generateShortIds as generateNanoIds,
  NANO_ALPHABETS,
} from "@workspace/tools/id/nanoid";
import {
  generateShortIds as generateUlids,
  MAX_ULID_TIME,
} from "@workspace/tools/id/ulid";
export const shortIdDefinitions = [
  ["ulid-generator", "ulid"],
  ["nanoid-generator", "nanoid"],
  ["cuid2-generator", "cuid2"],
] as const;
const count = z.number().int().min(1).max(100);
export function shortIdInputSchema(id: string) {
  if (id === "ulid-generator")
    return z.strictObject({
      count: count.default(1),
      timestamp: z.number().int().min(0).max(MAX_ULID_TIME).optional(),
      monotonic: z.boolean().default(false),
    });
  if (id === "nanoid-generator")
    return z.strictObject({
      count: count.default(5),
      length: z.number().int().min(1).max(128).default(21),
      preset: z
        .enum([...Object.keys(NANO_ALPHABETS), "custom"])
        .default("url-safe"),
      alphabet: z.string().max(1024).optional(),
    });
  if (id === "cuid2-generator")
    return z.strictObject({
      count: count.default(1),
      length: z.number().int().min(2).max(32).default(24),
    });
  throw Error("Unknown short-ID generator");
}
export const shortIdOutputSchema = z.strictObject({
  kind: z.enum(["ulid", "nanoid", "cuid2"]),
  ids: z.array(z.string()).max(100),
  count: z.number(),
  length: z.number(),
  timestamp: z.number().nullable(),
  monotonic: z.boolean(),
});
export async function runShortId(
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (id === "ulid-generator") {
    const args = shortIdInputSchema(id).parse(input);
    return generateUlids(
      "ulid",
      args as Parameters<typeof generateUlids>[1],
      signal,
    );
  }
  if (id === "nanoid-generator") {
    const args = shortIdInputSchema(id).parse(input);
    return generateNanoIds(
      "nanoid",
      args as Parameters<typeof generateNanoIds>[1],
      signal,
    );
  }
  if (id === "cuid2-generator") {
    const args = shortIdInputSchema(id).parse(input);
    const result = await generateCuid2Ids(
      "cuid2",
      args as Parameters<typeof generateCuid2Ids>[1],
      signal,
    );
    return { ...result, timestamp: null, monotonic: false };
  }
  throw Error("Unknown short-ID generator");
}
