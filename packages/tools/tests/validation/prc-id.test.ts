import { expect, it } from "vitest";
import { checkDigit, IdentityError, prcId } from "../../src/validation/prc-id";

it("validates a known Beijing ID and exposes region, birth, and gender details", () => {
  const result = prcId("110105199001010010", "2026-09-06");
  expect(result).toMatchObject({
    normalized: "110105199001010010",
    valid: true,
    checks: {
      length: true,
      format: true,
      region: true,
      birthdate: true,
      checksum: true,
    },
    details: {
      provinceCode: "110000",
      province: "北京市",
      cityCode: "110100",
      city: "市辖区",
      regionCode: "110105",
      district: "朝阳区",
      birthDate: "1990-01-01",
      birthYear: "1990",
      birthMonth: "01",
      birthDay: "01",
      gender: "male",
      sequence: "001",
      expected: "0",
      actual: "0",
    },
  });
  expect(result.details.age).toBe(36);
});

it("supports separators, uppercase checksum, and female sequence parity", () => {
  const result = prcId("110105-19900101-0029", "2026-09-06");
  expect(result.normalized).toBe("110105199001010029");
  expect(result.valid).toBe(true);
  expect(result.details.gender).toBe("female");
  expect(checkDigit("11010519900101002")).toBe("9");
  expect(checkDigit("11010519900101")).toBeNull();
});

it("keeps partial digit input useful while reporting incomplete checks", () => {
  const result = prcId("11010519900101", "2026-09-06");
  expect(result.valid).toBe(false);
  expect(result.checks).toEqual({
    length: false,
    format: false,
    region: false,
    birthdate: false,
    checksum: false,
  });
  expect(result.details).toMatchObject({
    partial: "yes",
    provinceCode: "110000",
    cityCode: "110100",
    regionCode: "110105",
    birthDate: "1990-01-01",
    gender: "unknown",
    sequence: null,
    expected: null,
    actual: null,
  });
  expect(prcId("", "2026-09-06").details.partial).toBe("yes");
  expect(prcId("123A", "2026-09-06").details.partial).toBe("no");
});

it("reports unknown regions, invalid checksum, and format placement", () => {
  const unknown = prcId("999999199001010010", "2026-09-06");
  expect(unknown.checks.region).toBe(false);
  expect(unknown.details.province).toBeNull();
  expect(unknown.details.city).toBeNull();
  expect(unknown.details.district).toBeNull();
  expect(prcId("110105199001010019", "2026-09-06").checks.checksum).toBe(false);
  expect(prcId("11010519900101001X", "2026-09-06").details.partial).toBe("no");
  expect(prcId("1101051990010100A0", "2026-09-06").checks.format).toBe(false);
});

it("rejects invalid birth dates and future dates without losing date details", () => {
  const invalid = prcId("110105202302300010", "2026-09-06");
  expect(invalid.checks.birthdate).toBe(false);
  expect(invalid.details.birthDate).toBeNull();
  expect(invalid.details.age).toBeNull();
  const future = prcId("110105203001010010", "2026-09-06");
  expect(future.details.birthDate).toBe("2030-01-01");
  expect(future.checks.birthdate).toBe(false);
  expect(future.details.age).toBeNull();
  const birthdayLater = prcId("110105199012310019", "2026-09-06");
  expect(birthdayLater.checks.birthdate).toBe(true);
  expect(birthdayLater.details.age).toBe(35);
});

it("validates today and input capacity before domain parsing", () => {
  for (const today of ["2026-2-01", "2026-02-30", "x"]) {
    expect(() => prcId("110105199001010010", today)).toThrow(
      new IdentityError("invalid_date"),
    );
  }
  expect(prcId("1".repeat(4096), "2026-09-06").details.length).toBe(4096);
  expect(() => prcId("x".repeat(4097), "2026-09-06")).toThrow("too_large");
  expect(() => prcId("x".repeat(4097), "not-a-date")).toThrow("too_large");
});

it("distinguishes leap centuries, impossible months, and birthday boundaries", () => {
  const leap = "11010520000229001";
  const result = prcId(leap + checkDigit(leap), "2024-02-29");
  expect(result.valid).toBe(true);
  expect(result.details.age).toBe(24);
  expect(prcId(leap + checkDigit(leap), "2024-02-28").details.age).toBe(23);
  for (const date of ["19000229", "20001301", "00000101"]) {
    const prefix = `110105${date}001`;
    const invalid = prcId(prefix + checkDigit(prefix), "2026-09-08");
    expect(invalid.checks.birthdate).toBe(false);
    expect(invalid.details.birthDate).toBeNull();
    expect(invalid.details.age).toBeNull();
  }
  expect(() => prcId("", "2024-13-01")).toThrow("invalid_date");
  expect(prcId("11010519491231002x", "2026-09-08").valid).toBe(true);
});
