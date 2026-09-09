import { getCountrySpecifications } from "ibantools";
import { validateImei as analyzeImei } from "@workspace/tools/validation/imei";
import { inspectBic } from "@workspace/tools/validation/bic";
import {
  validateIban,
  normalizeIdentifierInput,
} from "@workspace/tools/validation/iban";
export type IdentifierKind = "iban" | "bic" | "imei";
export type IdentifierFieldKey =
  | "country"
  | "length"
  | "format"
  | "structure"
  | "checksum"
  | "domestic"
  | "registry"
  | "expectedLength"
  | "actualLength"
  | "checkDigits"
  | "expectedCheckDigits"
  | "bban"
  | "formatted"
  | "sourceVersion"
  | "bank"
  | "location"
  | "branch"
  | "primaryOffice"
  | "test"
  | "passive"
  | "type"
  | "tac"
  | "serial";
export interface IdentifierResult {
  kind: IdentifierKind;
  normalized: string;
  valid: boolean;
  checks: Partial<Record<IdentifierFieldKey, boolean>>;
  details: Partial<
    Record<IdentifierFieldKey, string | number | boolean | null>
  >;
}

const countries = getCountrySpecifications();
export function validateBic(input: string): IdentifierResult {
  const value = normalizeIdentifierInput(input);
  const result = inspectBic(value);
  const country = value.slice(4, 6);
  const location = value.slice(6, 8);
  const checks = {
    length: result.isLengthValid,
    bank: result.isBankCodeValid,
    // The established protocol country table additionally recognizes XK.
    country: Object.hasOwn(countries, country),
    location: result.isLocationCodeValid,
    branch: result.isBranchCodeValid,
    format: result.isFormatValid,
  };
  return {
    kind: "bic",
    normalized: value,
    valid: Object.values(checks).every(Boolean),
    checks,
    details: {
      actualLength: result.length,
      type:
        result.type === "bic-8"
          ? "BIC-8"
          : result.type === "bic-11"
            ? "BIC-11"
            : null,
      bank: value.slice(0, 4) || null,
      country: country || null,
      location: location || null,
      branch: result.branchCode,
      primaryOffice: result.isPrimaryOffice,
      test: result.isTestBic,
      passive: result.isPassiveParticipant,
      sourceVersion: "ibantools 4.5.4",
    },
  };
}
export function validateImei(input: string): IdentifierResult {
  const result = analyzeImei(normalizeIdentifierInput(input));
  return {
    kind: "imei",
    normalized: result.normalized,
    valid: result.isValid,
    checks: {
      length: result.isLengthValid,
      format: result.isFormatValid,
      checksum: result.isChecksumValid,
    },
    details: {
      actualLength: result.length,
      tac: result.tac,
      serial: result.serialNumber,
      expectedCheckDigits: result.expectedCheckDigit,
      checkDigits: result.actualCheckDigit,
    },
  };
}
export function validateIdentifier(kind: IdentifierKind, input: string) {
  return kind === "iban"
    ? validateIban(input)
    : kind === "bic"
      ? validateBic(input)
      : validateImei(input);
}

import * as z from "zod/v4";
export const identifierDefinitions = [
  ["iban-validator", "iban"],
  ["bic-swift-validator", "bic"],
  ["imei-validator", "imei"],
] as const;
export const identifierInputSchema = z.strictObject({
  input: z.string().max(256),
});
export const identifierOutputSchema = z.strictObject({
  kind: z.enum(["iban", "bic", "imei"]),
  normalized: z.string(),
  valid: z.boolean(),
  checks: z.record(z.string(), z.boolean()),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});
export function runIdentifierValidation(
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const entry = identifierDefinitions.find(([slug]) => slug === id);
  if (!entry) throw Error("Unknown identifier validator");
  const args = identifierInputSchema.parse(input);
  return validateIdentifier(entry[1], args.input);
}
