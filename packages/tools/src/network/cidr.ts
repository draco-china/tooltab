import { formatIPv6 } from "./ipv6";
export const MAX_CIDR_TEXT = 10_000_000;
export const MAX_CIDR_ENTRIES = 200_000;
export class CidrError extends Error {
  constructor(
    public readonly code:
      | "invalid_ip"
      | "invalid_cidr"
      | "mixed_family"
      | "reversed"
      | "missing_merge"
      | "too_large"
      | "unsupported"
      | "invalid_list",
    public readonly issues: {
      group: string;
      line: number;
      value: string;
    }[] = [],
  ) {
    super(code);
  }
}
type Ip = { family: 4 | 6; value: bigint };
type Interval = Ip & { end: bigint };
export function parseIp(input: string): Ip {
  if (input.length > 100) throw new CidrError("invalid_ip");
  let s = input.trim();
  const v4 = (s: string) => {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) throw new CidrError("invalid_ip");
    const a = s.split(".").map(Number);
    if (a.some((n) => n > 255)) throw new CidrError("invalid_ip");
    return a.reduce((v, n) => v * 256n + BigInt(n), 0n);
  };
  if (!s.includes(":")) return { family: 4, value: v4(s) };
  if (s.includes(".")) {
    const index = s.lastIndexOf(":");
    const n = v4(s.slice(index + 1));
    s = `${s.slice(0, index + 1) + (n >> 16n).toString(16)}:${(n & 65535n).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/i.test(s)) throw new CidrError("invalid_ip");
  const parts = s.split("::");
  if (parts.length > 2) throw new CidrError("invalid_ip");
  const left = parts[0] ? parts[0].split(":") : [],
    right = parts[1] ? parts[1].split(":") : [];
  const count = left.length + right.length;
  if (
    (parts.length === 1 && count !== 8) ||
    (parts.length === 2 && count >= 8) ||
    [...left, ...right].some((p) => !/^[0-9a-f]{1,4}$/i.test(p))
  )
    throw new CidrError("invalid_ip");
  const words =
    parts.length === 2
      ? [...left, ...Array(8 - count).fill("0"), ...right]
      : left;
  return {
    family: 6,
    value: words.reduce(
      (v: bigint, p: string) => v * 65536n + BigInt(parseInt(p, 16)),
      0n,
    ),
  };
}
export function formatIp(value: bigint, family: 4 | 6) {
  if (family === 4)
    return [24n, 16n, 8n, 0n].map((n) => String((value >> n) & 255n)).join(".");
  return formatIPv6(
    Array.from({ length: 8 }, (_, i) =>
      Number((value >> BigInt((7 - i) * 16)) & 65535n),
    ),
  );
}
function block(input: string): Interval & { prefix: number; original: bigint } {
  if (input.length > 110) throw new CidrError("invalid_cidr");
  const p = input.trim().split("/");
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  if (p.length !== 2 || !/^\d{1,3}$/.test(p[1]!))
    throw new CidrError("invalid_cidr");
  let ip: Ip;
  try {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    ip = parseIp(p[0]!);
  } catch {
    throw new CidrError("invalid_cidr");
  }
  const prefix = Number(p[1]),
    bits = ip.family === 4 ? 32 : 128;
  if (prefix > bits) throw new CidrError("invalid_cidr");
  const size = 1n << BigInt(bits - prefix),
    value = (ip.value / size) * size;
  return { ...ip, value, end: value + size - 1n, prefix, original: ip.value };
}
export function parseCidr(input: string) {
  const b = block(input),
    bits = b.family === 4 ? 32 : 128,
    count = b.end - b.value + 1n,
    traditional = b.family === 4 && b.prefix < 31;
  const f = (v: bigint) => formatIp(v, b.family),
    mask = ((1n << BigInt(bits)) - 1n) ^ (count - 1n);
  return {
    family: b.family,
    prefix: b.prefix,
    hostBits: bits - b.prefix,
    inputAddress: f(b.original),
    canonicalCidr: `${f(b.value)}/${b.prefix}`,
    networkAddress: f(b.value),
    rangeStart: f(b.value),
    rangeEnd: f(b.end),
    firstUsable: f(b.value + (traditional ? 1n : 0n)),
    lastUsable: f(b.end - (traditional ? 1n : 0n)),
    broadcastAddress: b.family === 4 ? f(b.end) : null,
    netmask: b.family === 4 ? f(mask) : null,
    wildcardMask: b.family === 4 ? f(count - 1n) : null,
    addressCount: count.toString(),
    usableAddressCount: (count - (traditional ? 2n : 0n)).toString(),
    startInteger: b.value.toString(),
    endInteger: b.end.toString(),
  };
}
export function normalizeIpCidr(input: string) {
  if (input.includes("/")) return parseCidr(input).canonicalCidr;
  const ip = parseIp(input);
  return formatIp(ip.value, ip.family);
}
export function* cover(
  start: bigint,
  end: bigint,
  family: 4 | 6,
): Generator<string> {
  const bits = family === 4 ? 32 : 128;
  while (start <= end) {
    let power = start === 0n ? bits : 0;
    if (start !== 0n) {
      let n = start;
      while ((n & 1n) === 0n) {
        power++;
        n >>= 1n;
      }
    }
    const remaining = end - start + 1n;
    while (1n << BigInt(power) > remaining) power--;
    yield `${formatIp(start, family)}/${bits - power}`;
    start += 1n << BigInt(power);
  }
}
export function rangeToCidrs(start: string, end: string) {
  const a = parseIp(start),
    b = parseIp(end);
  if (a.family !== b.family) throw new CidrError("mixed_family");
  if (a.value > b.value) throw new CidrError("reversed");
  const cidrs = [...cover(a.value, b.value, a.family)];
  return {
    family: a.family,
    start: formatIp(a.value, a.family),
    end: formatIp(b.value, b.family),
    addressCount: (b.value - a.value + 1n).toString(),
    cidrs,
    blockCount: cidrs.length,
  };
}
function list(input: string, group: string) {
  if (input.length > MAX_CIDR_TEXT) throw new CidrError("too_large");
  const entries: Interval[] = [],
    issues: CidrError["issues"] = [];
  let line = 1,
    count = 0;
  // Match tokens with their preceding separator to preserve source line diagnostics without expanding empty rows.
  const re = /([^\s,]+)|([\s,]+)/g;
  for (const match of input.matchAll(re)) {
    if (match[2]) {
      line += (match[2].match(/\r\n|\r|\n/g) ?? []).length;
      continue;
    }
    if (++count > MAX_CIDR_ENTRIES) throw new CidrError("too_large");
    try {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      entries.push(block(match[1]!));
    } catch {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      issues.push({ group, line, value: match[1]!.slice(0, 150) });
    }
  }
  return { entries, issues, count };
}
function union(input: Interval[]) {
  input.sort(
    (a, b) =>
      a.family - b.family ||
      (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
  );
  const out: Interval[] = [];
  for (const item of input) {
    const last = out.at(-1);
    if (last && last.family === item.family && item.value <= last.end + 1n) {
      if (item.end > last.end) last.end = item.end;
    } else out.push({ ...item });
  }
  return out;
}
export function prepareMerge(merge: string, exclude: string) {
  const a = list(merge, "merge"),
    b = list(exclude, "exclude");
  if (a.issues.length || b.issues.length)
    throw new CidrError("invalid_list", [...a.issues, ...b.issues]);
  if (!a.count) throw new CidrError("missing_merge");
  const sources = union(a.entries),
    exclusions = union(b.entries),
    ranges: Interval[] = [];
  let j = 0;
  for (const source of sources) {
    let cursor = source.value;
    while (
      j < exclusions.length &&
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      (exclusions[j]!.family < source.family ||
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        (exclusions[j]!.family === source.family &&
          // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
          exclusions[j]!.end < cursor))
    )
      j++;
    for (let k = j; k < exclusions.length; k++) {
      const ex = exclusions[k];
      if (!ex || ex.family !== source.family || ex.value > source.end) break;
      if (ex.value > cursor)
        ranges.push({
          family: source.family,
          value: cursor,
          end: ex.value - 1n,
        });
      // union() makes exclusions disjoint and ordered; earlier ranges were skipped above.
      cursor = ex.end + 1n;
      if (cursor > source.end) break;
    }
    if (cursor <= source.end)
      ranges.push({ family: source.family, value: cursor, end: source.end });
  }
  return {
    ranges,
    mergeInputCount: a.count,
    excludeInputCount: b.count,
    familyLabels: [...new Set(sources.map((s) => `IPv${s.family}`))],
    addressCount: ranges
      .reduce((n, r) => n + r.end - r.value + 1n, 0n)
      .toString(),
  };
}
export function* mergeLines(result: ReturnType<typeof prepareMerge>) {
  for (const r of result.ranges) yield* cover(r.value, r.end, r.family);
}
export function mergeCidrs(merge: string, exclude: string) {
  const prepared = prepareMerge(merge, exclude),
    cidrs = [...mergeLines(prepared)];
  const { ranges: _, ...summary } = prepared;
  return { ...summary, cidrs, blockCount: cidrs.length };
}
