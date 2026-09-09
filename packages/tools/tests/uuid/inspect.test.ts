import { expect, it, vi } from "vitest";
import {
  convertUuid,
  inspectUuid,
  parseUuid,
  UUID_FORMATS,
  UUID_SAMPLE,
  UuidInspectionError,
  uuidRepresentations,
} from "../../src/uuid/inspect";

it("parses the documented relaxed forms while strict parsing stays canonical", () => {
  const id = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  expect(UUID_SAMPLE).toMatch(/^[\da-f-]{36}$/);
  for (const input of [
    id.toUpperCase(),
    `urn:uuid:${id}`,
    `{${id}}`,
    id.replaceAll("-", ""),
  ])
    expect(parseUuid(input)).toBe(parseUuid(id));
  for (const input of [`{${id}}`, ` ${id}`, "x".repeat(101)])
    expect(() => parseUuid(input, true)).toThrow(UuidInspectionError);
});

it("round-trips all encodings at unsigned 128-bit boundaries", () => {
  for (const value of [0n, 1n, 9007199254740993n, (1n << 128n) - 1n]) {
    const representations = uuidRepresentations(value);
    for (const format of UUID_FORMATS)
      expect(convertUuid(representations[format], format)).toEqual(
        representations,
      );
  }
  expect(convertUuid("_____________________w", "base64").hex).toBe(
    "f".repeat(32),
  );
  expect(convertUuid("/////////////////////w==", "base64").uuid).toBe(
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  );
});

it("rejects invalid encodings, overflow and decoder failures with format error codes", () => {
  const invalid: Array<[string, Parameters<typeof convertUuid>[1]]> = [
    ["x".repeat(513), "uuid"],
    ["340282366920938463463374607431768211456", "decimal"],
    ["-1", "decimal"],
    ["abc", "hex"],
    ["8", "octal"],
    ["1".repeat(129), "binary"],
    ["AAAAAAAAAAAAAAAAAAAAAB==", "base64"],
    ["/////////////////////w", "base64"],
    ["_____________________w=", "base64"],
  ];
  for (const [input, format] of invalid)
    expect(() => convertUuid(input, format)).toThrow(`invalid_${format}`);
  expect(() => uuidRepresentations(-1n)).toThrow("invalid_uuid");
  expect(() => uuidRepresentations(1n << 128n)).toThrow("invalid_uuid");
  const atob = vi.fn(() => {
    throw new Error("decode");
  });
  vi.stubGlobal("atob", atob);
  expect(() => convertUuid("AAAAAAAAAAAAAAAAAAAAAA==", "base64")).toThrow(
    "invalid_base64",
  );
  vi.unstubAllGlobals();
});

it("reports special values, all variant classes, versions and namespace algorithms", () => {
  expect(
    inspectUuid("00000000-0000-0000-0000-000000000000", true),
  ).toMatchObject({
    special: "nil",
    valid: true,
    supportedVersion: true,
    supportedVariant: true,
  });
  expect(
    inspectUuid("ffffffff-ffff-ffff-ffff-ffffffffffff", true).special,
  ).toBe("max");
  for (let version = 1; version <= 8; version++)
    expect(
      inspectUuid(`00000000-0000-${version}000-8000-000000000000`, true).valid,
    ).toBe(true);
  expect(inspectUuid("00000000-0000-9000-8000-000000000000").valid).toBe(false);
  for (const [nibble, variant] of [
    ["0", "ncs"],
    ["c", "microsoft"],
    ["e", "future"],
  ] as const)
    expect(
      inspectUuid(`00000000-0000-1000-${nibble}000-000000000000`).variant,
    ).toBe(variant);
  expect(inspectUuid("00000000-0000-3000-8000-000000000000").algorithm).toBe(
    "MD5",
  );
  expect(inspectUuid("00000000-0000-5000-8000-000000000000").algorithm).toBe(
    "SHA-1",
  );
  expect(
    inspectUuid("00000000-0000-4000-8000-000000000000").algorithm,
  ).toBeNull();
});

it("decodes RFC 9562 v1, v6 and v7 timestamps including pre-Unix ticks", () => {
  const v1 = inspectUuid("c232ab00-9414-11ec-b3c8-9f6bdeced846");
  const v6 = inspectUuid("1ec9414c-232a-6b00-b3c8-9f6bdeced846");
  expect(v1.time?.unixMilliseconds).toBe("1645557742000");
  expect(v6.time).toEqual(v1.time);
  expect(v1.node).toEqual({
    identifier: "9f:6b:de:ce:d8:46",
    multicast: true,
    clockSequence: 13256,
  });
  expect(inspectUuid("017f22e2-79b0-7cc3-98c4-dc0c0c07398f").time).toEqual({
    unixMilliseconds: "1645557742000",
    utc: "2022-02-22T19:22:22.000Z",
  });
  expect(
    inspectUuid("c232ab01-9414-11ec-b3c8-9f6bdeced846").time?.unixMilliseconds,
  ).toBe("1645557742000.0001");
  expect(inspectUuid("13813fff-1dd2-11b2-8000-000000000000").time).toEqual({
    unixMilliseconds: "-0.0001",
    utc: "1969-12-31T23:59:59.999Z",
    subMillisecondTicks: 9999,
  });
  expect(
    inspectUuid("ffffffff-ffff-7fff-bfff-ffffffffffff").time?.unixMilliseconds,
  ).toBe("281474976710655");
});
