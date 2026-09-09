export const UUID_SAMPLE = "c1ed67f0-34bd-11f0-b3fe-02d71e841f4f";
export const UUID_FORMATS = [
  "uuid",
  "base64",
  "hex",
  "decimal",
  "octal",
  "binary",
] as const;

export type UuidFormat = (typeof UUID_FORMATS)[number];

const maximum = (1n << 128n) - 1n;
const canonical = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class UuidInspectionError extends Error {
  constructor(
    public readonly code:
      | "invalid_uuid"
      | "invalid_base64"
      | "invalid_hex"
      | "invalid_decimal"
      | "invalid_octal"
      | "invalid_binary",
  ) {
    super(code);
  }
}

function fail(format: UuidFormat): never {
  throw new UuidInspectionError(`invalid_${format}`);
}

export function parseUuid(input: string, strict = false): bigint {
  if (input.length > 100) fail("uuid");
  let value = strict ? input : input.trim();
  if (!strict) {
    if (/^urn:uuid:/i.test(value)) value = value.slice(9);
    if (value.startsWith("{") && value.endsWith("}"))
      value = value.slice(1, -1);
  }
  if (!(canonical.test(value) || (!strict && /^[\da-f]{32}$/i.test(value))))
    fail("uuid");
  return BigInt(`0x${value.replaceAll("-", "")}`);
}

export function uuidRepresentations(value: bigint): Record<UuidFormat, string> {
  if (value < 0n || value > maximum) fail("uuid");
  const hex = value.toString(16).padStart(32, "0");
  let bytes = "";
  for (let index = 0; index < 32; index += 2)
    bytes += String.fromCharCode(
      Number.parseInt(hex.slice(index, index + 2), 16),
    );
  return {
    uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    hex,
    base64: btoa(bytes),
    decimal: value.toString(10),
    octal: value.toString(8),
    binary: value.toString(2).padStart(128, "0"),
  };
}

export function convertUuid(
  input: string,
  format: UuidFormat,
): Record<UuidFormat, string> {
  if (input.length > 512) fail(format);
  const text = input.trim();
  let value: bigint;
  if (format === "uuid") value = parseUuid(text);
  else if (format === "base64") {
    if (!/^(?:[A-Za-z0-9+/]{22}==|[A-Za-z0-9_-]{22}(?:==)?)$/.test(text))
      fail(format);
    const normalized = `${text.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/, "")}==`;
    let decoded: string;
    try {
      decoded = atob(normalized);
    } catch {
      fail(format);
    }
    if (decoded.length !== 16 || btoa(decoded) !== normalized) fail(format);
    value = BigInt(
      `0x${Array.from(decoded, (character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`,
    );
  } else {
    const patterns = {
      hex: /^[\da-f]{32}$/i,
      decimal: /^\d{1,39}$/,
      octal: /^[0-7]{1,43}$/,
      binary: /^[01]{1,128}$/,
    };
    if (!patterns[format]?.test(text)) fail(format);
    value = BigInt(
      `${format === "hex" ? "0x" : format === "octal" ? "0o" : format === "binary" ? "0b" : ""}${text}`,
    );
  }
  if (value > maximum) fail(format);
  return uuidRepresentations(value);
}

export function inspectUuid(input: string, strict = false) {
  const value = parseUuid(input, strict);
  const representations = uuidRepresentations(value);
  const hex = representations.hex;
  const special = value === 0n ? "nil" : value === maximum ? "max" : null;
  const version = Number.parseInt(hex[12], 16);
  const variantNibble = Number.parseInt(hex[16], 16);
  const variant =
    variantNibble < 8
      ? "ncs"
      : variantNibble < 12
        ? "rfc"
        : variantNibble < 14
          ? "microsoft"
          : "future";
  const supportedVersion = Boolean(special) || (version >= 1 && version <= 8);
  const supportedVariant = Boolean(special) || variant === "rfc";
  let time: null | {
    unixMilliseconds: string;
    utc: string;
    subMillisecondTicks?: number;
  } = null;
  let node: null | {
    identifier: string;
    multicast: boolean;
    clockSequence: number;
  } = null;
  if (!special && variant === "rfc") {
    if (version === 1 || version === 6) {
      const ticks =
        version === 1
          ? (BigInt(`0x${hex.slice(13, 16)}`) << 48n) |
            (BigInt(`0x${hex.slice(8, 12)}`) << 32n) |
            BigInt(`0x${hex.slice(0, 8)}`)
          : (BigInt(`0x${hex.slice(0, 12)}`) << 12n) |
            BigInt(`0x${hex.slice(13, 16)}`);
      const delta = ticks - 122192928000000000n;
      const sign = delta < 0n ? "-" : "";
      const absolute = delta < 0n ? -delta : delta;
      const fraction = (absolute % 10000n)
        .toString()
        .padStart(4, "0")
        .replace(/0+$/, "");
      const floorMs = delta >= 0n ? delta / 10000n : (delta - 9999n) / 10000n;
      time = {
        unixMilliseconds: `${sign}${absolute / 10000n}${fraction ? `.${fraction}` : ""}`,
        utc: new Date(Number(floorMs)).toISOString(),
        subMillisecondTicks: Number(((delta % 10000n) + 10000n) % 10000n),
      };
      node = {
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        identifier: hex.slice(20).match(/../g)!.join(":"),
        multicast: (Number.parseInt(hex.slice(20, 22), 16) & 1) === 1,
        clockSequence: Number.parseInt(hex.slice(16, 20), 16) & 0x3fff,
      };
    } else if (version === 7) {
      const milliseconds = Number.parseInt(hex.slice(0, 12), 16);
      time = {
        unixMilliseconds: String(milliseconds),
        utc: new Date(milliseconds).toISOString(),
      };
    }
  }
  return {
    representations,
    version,
    special,
    variant,
    supportedVersion,
    supportedVariant,
    valid: supportedVersion && supportedVariant,
    segments: representations.uuid.split("-"),
    time,
    node,
    algorithm:
      !special && variant === "rfc"
        ? version === 3
          ? "MD5"
          : version === 5
            ? "SHA-1"
            : null
        : null,
  };
}
