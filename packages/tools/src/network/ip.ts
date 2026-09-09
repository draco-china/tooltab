import { formatIPv6 } from "./ipv6";

type IpFamily = 4 | 6;
type Ipv4Segments = readonly [number, number, number, number];

type ParsedIpv4Address = Readonly<{
  family: 4;
  segments: Ipv4Segments;
  value: bigint;
}>;

type ParsedIpv6Address = Readonly<{
  family: 6;
  segments: readonly number[];
  value: bigint;
}>;

type ParsedIpAddress = ParsedIpv4Address | ParsedIpv6Address;

const IPV4_BITS = 32;
const IPV6_BITS = 128;
const IPV4_SEGMENT_COUNT = 4;
const IPV6_SEGMENT_COUNT = 8;

function bitSizeForFamily(family: IpFamily) {
  return family === 4 ? IPV4_BITS : IPV6_BITS;
}

function parseIpAddress(input: string): ParsedIpAddress | null {
  const value = input.trim();
  const ipv4 = parseIpv4(value);

  if (ipv4 !== null) {
    return {
      family: 4,
      segments: ipv4,
      value: segmentsToBigInt(ipv4, 8),
    };
  }

  const ipv6 = parseIpv6(value);

  if (ipv6 !== null) {
    return {
      family: 6,
      segments: ipv6,
      value: segmentsToBigInt(ipv6, 16),
    };
  }

  return null;
}

function createAddressFromValue(
  value: bigint,
  family: IpFamily,
): ParsedIpAddress {
  if (family === 4) {
    const segments = bigIntToSegments(value, IPV4_SEGMENT_COUNT, 8);
    const ipv4Segments = toIpv4Segments(segments);

    return {
      family: 4,
      segments: ipv4Segments,
      value,
    };
  }

  const segments = bigIntToSegments(value, IPV6_SEGMENT_COUNT, 16);

  return {
    family: 6,
    segments,
    value,
  };
}

function stringifyIpAddress(address: ParsedIpAddress) {
  return address.family === 4
    ? address.segments.join(".")
    : formatIPv6(address.segments);
}

function parseIpv4(value: string): Ipv4Segments | null {
  const parts = value.split(".");

  if (parts.length !== IPV4_SEGMENT_COUNT) {
    return null;
  }

  const segments: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const segment = Number(part);

    if (segment < 0 || segment > 255) {
      return null;
    }

    segments.push(segment);
  }

  return toIpv4Segments(segments);
}

function toIpv4Segments(segments: readonly number[]): Ipv4Segments {
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return [segments[0]!, segments[1]!, segments[2]!, segments[3]!];
}

function parseIpv6(value: string): readonly number[] | null {
  if (value.length === 0 || value.includes("%")) {
    return null;
  }

  const doubleColonIndex = value.indexOf("::");

  if (
    doubleColonIndex !== -1 &&
    value.indexOf("::", doubleColonIndex + 1) !== -1
  ) {
    return null;
  }

  if (doubleColonIndex === -1) {
    const segments = parseIpv6Sequence(value.split(":"), true);

    return segments !== null && segments.length === IPV6_SEGMENT_COUNT
      ? segments
      : null;
  }

  const left = value.slice(0, doubleColonIndex);
  const right = value.slice(doubleColonIndex + 2);
  const leftSegments =
    left.length === 0
      ? []
      : parseIpv6Sequence(left.split(":"), right.length === 0);
  const rightSegments =
    right.length === 0 ? [] : parseIpv6Sequence(right.split(":"), true);

  if (leftSegments === null || rightSegments === null) {
    return null;
  }

  const filledSegmentCount = leftSegments.length + rightSegments.length;

  if (filledSegmentCount >= IPV6_SEGMENT_COUNT) {
    return null;
  }

  return [
    ...leftSegments,
    ...Array.from({ length: IPV6_SEGMENT_COUNT - filledSegmentCount }, () => 0),
    ...rightSegments,
  ];
}

function parseIpv6Sequence(
  parts: readonly string[],
  allowIpv4AtEnd: boolean,
): number[] | null {
  const segments: number[] = [];

  for (const [index, part] of parts.entries()) {
    if (part.length === 0) {
      return null;
    }

    if (part.includes(".")) {
      if (!allowIpv4AtEnd || index !== parts.length - 1) {
        return null;
      }

      const ipv4 = parseIpv4(part);

      if (ipv4 === null) {
        return null;
      }

      segments.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      continue;
    }

    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) {
      return null;
    }

    segments.push(Number.parseInt(part, 16));
  }

  return segments;
}

function segmentsToBigInt(segments: readonly number[], segmentBits: number) {
  return segments.reduce(
    (result, segment) => (result << BigInt(segmentBits)) | BigInt(segment),
    0n,
  );
}

function bigIntToSegments(
  value: bigint,
  segmentCount: number,
  segmentBits: number,
) {
  return Array.from({ length: segmentCount }, (_, index) => {
    const shift = BigInt(segmentBits * (segmentCount - index - 1));
    const mask = (1n << BigInt(segmentBits)) - 1n;

    return Number((value >> shift) & mask);
  });
}

export type { ParsedIpAddress };
export {
  bitSizeForFamily,
  createAddressFromValue,
  IPV4_BITS,
  IPV6_BITS,
  parseIpAddress,
  stringifyIpAddress,
};
