import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import { convertBase, MAX_BASE_INPUT } from "@workspace/tools/number/base";
import { fromRoman, toRoman } from "@workspace/tools/number/roman";
import {
  fromChineseAmount,
  toChineseAmount,
} from "@workspace/tools/number/chinese-amount";

const baseInput = z.strictObject({
  input: z.string().max(MAX_BASE_INPUT),
  from: z.number().int().min(2).max(64),
  to: z.number().int().min(2).max(64),
  numeric64: z.boolean().default(false),
  outputNumeric64: z.boolean().default(false),
});
const romanInput = z.strictObject({
  input: z.string().max(32),
  direction: z.enum(["toRoman", "fromRoman"]),
});
const chineseInput = z.strictObject({
  input: z.string().max(128),
  direction: z.enum(["toChinese", "fromChinese"]),
  traditional: z.boolean().default(false),
});
export const numberConverterOperations: Operation[] = [
  {
    id: "number-base-converter",
    name: "tooltab_number_base_converter",
    description:
      "Convert signed integers exactly between radix2–64. Dedicated numeric64 alphabet is optional and differs from standard radix64.",
    inputSchema: baseInput,
    outputSchema: z.strictObject({ output: z.string() }),
    bodyLimit: 86000,
    idempotent: true,
    run(input) {
      const a = baseInput.parse(input);
      return {
        output: convertBase(
          a.input,
          a.from,
          a.to,
          a.numeric64,
          a.outputNumeric64,
        ),
      };
    },
  },
  {
    id: "roman-numeral-converter",
    name: "tooltab_roman_numeral_converter",
    description:
      "Convert standard Roman notation and integer1–3999. Noncanonical forms are rejected.",
    inputSchema: romanInput,
    outputSchema: z.strictObject({ output: z.string() }),
    bodyLimit: 4096,
    idempotent: true,
    run(input) {
      const a = romanInput.parse(input);
      return {
        output:
          a.direction === "toRoman" ? toRoman(a.input) : fromRoman(a.input),
      };
    },
  },
  {
    id: "chinese-uppercase-number-converter",
    name: "tooltab_chinese_uppercase_number_converter",
    description:
      "Convert financial Chinese amounts in either direction, with simplified/traditional output, signed values and exact integer cents.",
    inputSchema: chineseInput,
    outputSchema: z.strictObject({ number: z.string(), uppercase: z.string() }),
    bodyLimit: 4096,
    idempotent: true,
    run(input) {
      const a = chineseInput.parse(input);
      return a.direction === "toChinese"
        ? toChineseAmount(a.input, a.traditional)
        : fromChineseAmount(a.input, a.traditional);
    },
  },
];
