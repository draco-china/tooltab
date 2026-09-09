import * as z from "zod/v4";
import type { Operation } from "./operation-contract";
import {
  generateNumbers,
  randomRange,
  randomDefaults,
} from "@workspace/tools/number/random";
export const randomNumberInputSchema = z
  .strictObject({
    min: z.string().max(400).default(randomDefaults.min),
    max: z.string().max(400).default(randomDefaults.max),
    count: z.number().int().min(1).max(100).default(randomDefaults.count),
    numberType: z
      .enum(["integer", "decimal"])
      .default(randomDefaults.numberType),
    decimalPlaces: z
      .number()
      .int()
      .min(0)
      .max(6)
      .default(randomDefaults.decimalPlaces),
    allowRepeat: z.boolean().default(randomDefaults.allowRepeat),
  })
  .refine((o) => {
    try {
      randomRange(o);
      return true;
    } catch {
      return false;
    }
  }, "Invalid or insufficient random-number range");
export const randomNumberOperation: Operation = {
  id: "random-number-generator",
  name: "tooltab_random_number_generator",
  description:
    "Generate 1..100 cryptographically random integers or fixed-point decimals using unbiased rejection sampling. Exact decimal-string bounds, inclusive available grid values,0..6 decimal places, optional sampling without replacement. Returns exact strings. No persistent history or background rolling on the service; each call is a new actual draw.",
  inputSchema: randomNumberInputSchema,
  outputSchema: z.strictObject({
    values: z.array(z.string()),
    output: z.string(),
    availableValues: z.string(),
  }),
  bodyLimit: 7000,
  idempotent: false,
  run(input, signal) {
    signal?.throwIfAborted();
    return generateNumbers(randomNumberInputSchema.parse(input));
  },
};
