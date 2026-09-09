import isoCountryCodes from "./iso-country-codes.json";

export type BicType = "bic-8" | "bic-11" | "unknown";
export type BicValidation = {
  input: string;
  normalized: string;
  length: number;
  type: BicType;
  bankCode: string | null;
  countryCode: string | null;
  locationCode: string | null;
  branchCode: string | null;
  isLengthValid: boolean;
  isBankCodeValid: boolean;
  isCountryCodeValid: boolean;
  isCountryValid: boolean;
  isLocationCodeValid: boolean;
  isBranchCodeValid: boolean;
  isFormatValid: boolean;
  isPrimaryOffice: boolean;
  isTestBic: boolean;
  isPassiveParticipant: boolean;
  isValid: boolean;
};

const countries = new Set(isoCountryCodes);

export function normalizeBic(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function inspectBic(normalized: string): BicValidation {
  const length = normalized.length;
  const type: BicType =
    length === 8 ? "bic-8" : length === 11 ? "bic-11" : "unknown";
  const bankCode = length >= 4 ? normalized.slice(0, 4) : null;
  const countryCode = length >= 6 ? normalized.slice(4, 6) : null;
  const locationCode = length >= 8 ? normalized.slice(6, 8) : null;
  const branchCode = length === 11 ? normalized.slice(8, 11) : null;
  const isLengthValid = length === 8 || length === 11;
  const isBankCodeValid = !!bankCode && /^[A-Z]{4}$/.test(bankCode);
  const isCountryCodeValid = !!countryCode && /^[A-Z]{2}$/.test(countryCode);
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const isCountryValid = isCountryCodeValid && countries.has(countryCode!);
  const isLocationCodeValid =
    !!locationCode && /^[A-Z0-9]{2}$/.test(locationCode);
  const isBranchCodeValid =
    length === 8 || (!!branchCode && /^[A-Z0-9]{3}$/.test(branchCode));
  const isFormatValid = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(
    normalized,
  );
  return {
    input: normalized,
    normalized,
    length,
    type,
    bankCode,
    countryCode,
    locationCode,
    branchCode,
    isLengthValid,
    isBankCodeValid,
    isCountryCodeValid,
    isCountryValid,
    isLocationCodeValid,
    isBranchCodeValid,
    isFormatValid,
    isPrimaryOffice: type === "bic-8" || branchCode === "XXX",
    isTestBic: locationCode?.[1] === "0",
    isPassiveParticipant: locationCode?.[1] === "1",
    isValid:
      isLengthValid &&
      isBankCodeValid &&
      isCountryCodeValid &&
      isCountryValid &&
      isLocationCodeValid &&
      isBranchCodeValid &&
      isFormatValid,
  };
}

export function validateBic(input: string): BicValidation {
  const normalized = normalizeBic(input);
  return { ...inspectBic(normalized), input };
}
