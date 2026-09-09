import { validateIsbn } from "@workspace/tools/validation/isbn";
import { inspectVin } from "@workspace/tools/validation/vin";
import { validateCard as analyzeCard } from "@workspace/tools/validation/card";
export type ChecksumKind = "isbn" | "vin" | "card";
export interface ChecksumResult {
  kind: ChecksumKind;
  normalized: string;
  valid: boolean;
  checks: Record<string, boolean>;
  details: Record<string, string | number | null>;
}
export class ChecksumInputError extends Error {
  constructor() {
    super("input-too-large");
  }
}
function normalize(input: string) {
  if (input.length > 256) throw new ChecksumInputError();
  return input
    .replace(/[\s-]/g, "")
    .replace(/[a-z]/g, (char) => char.toUpperCase());
}
export function validateVin(input: string): ChecksumResult {
  const value = normalize(input);
  const result = inspectVin(value);
  const length = result.isLengthValid;
  const format = value.length > 0 && result.isCharacterValid;
  return {
    kind: "vin",
    normalized: value,
    valid: length && format && result.isCheckDigitValid,
    checks: { length, format, checksum: result.isCheckDigitValid },
    details: {
      length: value.length,
      expected: result.expectedCheckDigit,
      actual: result.actualCheckDigit,
      wmi: length ? value.slice(0, 3) : null,
      vds: length ? value.slice(3, 9) : null,
      vis: length ? value.slice(9) : null,
      yearCode: length ? value[9] : null,
      plant: length ? value[10] : null,
      serial: length ? value.slice(11) : null,
    },
  };
}
export function validateCard(input: string): ChecksumResult {
  // Preserve the protocol's ASCII normalization and capacity error class.
  const result = analyzeCard(normalize(input));
  return {
    kind: "card",
    ...result,
    details: {
      ...result.details,
      sourceVersion: "credit-card-type 10.3.0",
    },
  };
}
export function validateChecksum(kind: ChecksumKind, input: string) {
  return kind === "isbn"
    ? validateIsbn(input)
    : kind === "vin"
      ? validateVin(input)
      : validateCard(input);
}

import * as z from "zod/v4";
export const checksumDefinitions = [
  ["isbn-validator", "isbn"],
  ["vin-validator", "vin"],
  ["credit-card-validator", "card"],
] as const;
export const checksumInputSchema = z.strictObject({
  input: z.string().max(256),
});
export const checksumOutputSchema = z.strictObject({
  kind: z.enum(["isbn", "vin", "card"]),
  normalized: z.string(),
  valid: z.boolean(),
  checks: z.record(z.string(), z.boolean()),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});
export function runChecksumValidation(
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const item = checksumDefinitions.find(([slug]) => slug === id);
  if (!item) throw Error("Unknown checksum validator");
  return validateChecksum(item[1], checksumInputSchema.parse(input).input);
}
