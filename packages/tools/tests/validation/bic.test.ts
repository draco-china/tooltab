import { expect, it } from "vitest";
import {
  inspectBic,
  normalizeBic,
  validateBic,
} from "../../src/validation/bic";

it("normalizes and validates BIC-8 and BIC-11 values", () => {
  expect(normalizeBic(" deut-deff ")).toBe("DEUTDEFF");
  expect(validateBic("deut deff")).toMatchObject({
    input: "deut deff",
    normalized: "DEUTDEFF",
    length: 8,
    type: "bic-8",
    bankCode: "DEUT",
    countryCode: "DE",
    locationCode: "FF",
    branchCode: null,
    isLengthValid: true,
    isBankCodeValid: true,
    isCountryCodeValid: true,
    isCountryValid: true,
    isLocationCodeValid: true,
    isBranchCodeValid: true,
    isFormatValid: true,
    isPrimaryOffice: true,
    isTestBic: false,
    isPassiveParticipant: false,
    isValid: true,
  });
  expect(validateBic("DEUTDEFF500")).toMatchObject({
    type: "bic-11",
    branchCode: "500",
    isPrimaryOffice: false,
    isValid: true,
  });
});

it("recognizes test and passive participant location codes", () => {
  expect(validateBic("DEUTDEF0")).toMatchObject({
    isTestBic: true,
    isPassiveParticipant: false,
    isValid: true,
  });
  expect(validateBic("DEUTDEF1")).toMatchObject({
    isTestBic: false,
    isPassiveParticipant: true,
    isValid: true,
  });
  expect(validateBic("DEUTDEFFXXX")).toMatchObject({
    isPrimaryOffice: true,
    isValid: true,
  });
});

it("reports unsupported countries and each malformed section", () => {
  expect(validateBic("DEUTZZFF")).toMatchObject({
    isCountryCodeValid: true,
    isCountryValid: false,
    isValid: false,
  });
  expect(validateBic("12UTDEFF")).toMatchObject({
    isBankCodeValid: false,
    isFormatValid: false,
    isValid: false,
  });
  expect(validateBic("DE1TDEFF")).toMatchObject({ isBankCodeValid: false });
  expect(validateBic("DEUT1EFF")).toMatchObject({ isCountryCodeValid: false });
  expect(validateBic("DEUTDE!F")).toMatchObject({ isLocationCodeValid: false });
  expect(validateBic("DEUTDEFF!00")).toMatchObject({
    isBranchCodeValid: false,
    isFormatValid: false,
  });
});

it("handles unknown lengths and partial fields", () => {
  expect(validateBic("")).toMatchObject({
    type: "unknown",
    length: 0,
    bankCode: null,
    countryCode: null,
    locationCode: null,
    branchCode: null,
    isLengthValid: false,
    isBankCodeValid: false,
    isCountryCodeValid: false,
    isCountryValid: false,
    isLocationCodeValid: false,
    isBranchCodeValid: false,
    isFormatValid: false,
    isPrimaryOffice: false,
    isTestBic: false,
    isPassiveParticipant: false,
    isValid: false,
  });
  expect(validateBic("DEUT")).toMatchObject({
    type: "unknown",
    bankCode: "DEUT",
    countryCode: null,
    isBankCodeValid: true,
  });
  expect(validateBic("DEUTDEFF50").isLengthValid).toBe(false);
});

it("inspects protocol-normalized input without applying Unicode normalization", () => {
  expect(inspectBic("DEUTDEFF")).toMatchObject({
    input: "DEUTDEFF",
    normalized: "DEUTDEFF",
    isValid: true,
  });
  const sharpS = inspectBic("DEUTßEFF");
  expect(sharpS.input).toBe("DEUTßEFF");
  expect(sharpS.normalized).toBe("DEUTßEFF");
  expect(sharpS.isFormatValid).toBe(false);
  expect(sharpS.isValid).toBe(false);
});
