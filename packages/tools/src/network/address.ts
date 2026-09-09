/* biome-ignore-all lint/suspicious/noControlCharactersInRegex: Control characters are explicitly rejected at input boundaries. */
import punycode from "punycode/";
import { formatIPv6 } from "./ipv6";
export class AddressError extends Error {
  constructor(
    public readonly code:
      | "invalid_mac"
      | "invalid_ipv6"
      | "invalid_zone"
      | "invalid_domain"
      | "invalid_url"
      | "invalid_port"
      | "too_large"
      | "invalid_unicode",
  ) {
    super(code);
  }
}
function unicode(input: string, max = 100000) {
  if (input.length > max) throw new AddressError("too_large");
  for (const c of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const p = c.codePointAt(0)!;
    if (p >= 0xd800 && p <= 0xdfff) throw new AddressError("invalid_unicode");
  }
}
function zone(input: string) {
  unicode(input, 100);
  const z = input.trim();
  if (z && !/^[A-Za-z0-9_.:@~-]{1,64}$/.test(z))
    throw new AddressError("invalid_zone");
  return z;
}
export function macToIpv6(input: string, networkInterface = "") {
  unicode(input, 100);
  const s = input.trim();
  if (
    !/^(?:[\da-f]{12}|(?:[\da-f]{2}:){5}[\da-f]{2}|(?:[\da-f]{2}-){5}[\da-f]{2}|(?:[\da-f]{4}\.){2}[\da-f]{4})$/i.test(
      s,
    )
  )
    throw new AddressError("invalid_mac");
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const bytes = s
    .replace(/[:.-]/g, "")
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  const eui = [
    bytes[0] ^ 2,
    bytes[1],
    bytes[2],
    255,
    254,
    bytes[3],
    bytes[4],
    bytes[5],
  ];
  const words = [
    0xfe80,
    0,
    0,
    0,
    ...Array.from({ length: 4 }, (_, i) => eui[i * 2] * 256 + eui[i * 2 + 1]),
  ];
  const name = zone(networkInterface);
  return {
    ipv6: formatIPv6(words) + (name ? `%${name}` : ""),
    mac: bytes
      .map((n) => n.toString(16).padStart(2, "0"))
      .join(":")
      .toUpperCase(),
  };
}
export function ipv6ToMac(input: string) {
  unicode(input, 200);
  const split = input.trim().split("%");
  if (split.length > 2 || (split.length === 2 && !split[1]))
    throw new AddressError("invalid_ipv6");
  if (split[1]) zone(split[1]);
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const value = split[0]!;
  if (!/^[\da-f:.]+$/i.test(value)) throw new AddressError("invalid_ipv6");
  let canonical: string;
  try {
    canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    throw new AddressError("invalid_ipv6");
  }
  const halves = canonical.split("::"),
    left = halves[0] ? halves[0].split(":") : [],
    right = halves[1] ? halves[1].split(":") : [];
  const words = (
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
      : left
  ).map((v) => parseInt(v, 16));
  const bytes = words.flatMap((w) => [w >> 8, w & 255]);
  if (bytes[11] !== 255 || bytes[12] !== 254)
    return { convertible: false as const, ipv6: canonical, mac: null };
  const mac = [
    bytes[8] ^ 2,
    bytes[9],
    bytes[10],
    bytes[13],
    bytes[14],
    bytes[15],
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();
  return { convertible: true as const, ipv6: canonical, mac };
}
function domainLabels(input: string) {
  unicode(input, 4096);
  if (/[\s\p{Cc}/@:\\?#]/u.test(input))
    throw new AddressError("invalid_domain");
  const normalized = input.replace(/[\u3002\uff0e\uff61]/g, ".");
  const trailing = normalized.endsWith(".");
  const labels = (trailing ? normalized.slice(0, -1) : normalized).split(".");
  if (labels.some((l) => !l)) throw new AddressError("invalid_domain");
  return { labels, trailing };
}
function asciiLabel(label: string) {
  if (label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    throw new AddressError("invalid_domain");
  if (label.toLowerCase().startsWith("xn--")) {
    let decoded: string;
    try {
      decoded = punycode.decode(label.slice(4));
    } catch {
      throw new AddressError("invalid_domain");
    }
    unicode(decoded, 1000);
    if (
      !/[^\x00-\x7f]/.test(decoded) ||
      /[\s\p{Cc}.\u3002\uff0e\uff61/@:\\?#]/u.test(decoded) ||
      `xn--${punycode.encode(decoded)}`.toLowerCase() !== label.toLowerCase()
    )
      throw new AddressError("invalid_domain");
  }
}
export function convertDomain(
  input: string,
  direction: "ascii" | "unicode" = "ascii",
) {
  if (!["ascii", "unicode"].includes(direction))
    throw new AddressError("invalid_domain");
  if (input === "") return { ascii: "", unicode: "" };
  const { labels, trailing } = domainLabels(input);
  let ascii: string[], decoded: string[];
  try {
    if (direction === "ascii") {
      ascii = labels.map((label) =>
        /[^\x00-\x7f]/.test(label) ? `xn--${punycode.encode(label)}` : label,
      );
      ascii.forEach(asciiLabel);
      decoded = ascii.map((l) =>
        l.toLowerCase().startsWith("xn--") ? punycode.decode(l.slice(4)) : l,
      );
    } else {
      labels.forEach(asciiLabel);
      ascii = labels;
      decoded = labels.map((l) =>
        l.toLowerCase().startsWith("xn--") ? punycode.decode(l.slice(4)) : l,
      );
    }
  } catch (e) {
    if (e instanceof AddressError) throw e;
    throw new AddressError("invalid_domain");
  }
  const domain = ascii.join(".");
  if (domain.length > 253) throw new AddressError("invalid_domain");
  return {
    ascii: domain + (trailing ? "." : ""),
    unicode: decoded.join(".") + (trailing ? "." : ""),
  };
}
export type UrlDraft = {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  fragment: string;
  queryEntries: { key: string; value: string }[];
  opaque: boolean;
};
export const SAMPLE_URL =
  "https://example.com/products/blue%20mug?tag=coffee&tag=featured#details";
function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AddressError("invalid_url");
  }
}
export function parseUrl(input: string) {
  unicode(input);
  if (/[\u0000-\u001f\u007f]/.test(input.trim()))
    throw new AddressError("invalid_url");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new AddressError("invalid_url");
  }
  decode(url.search.replaceAll("+", " "));
  decode(url.pathname);
  const draft: UrlDraft = {
    protocol: url.protocol.slice(0, -1),
    username: decode(url.username),
    password: decode(url.password),
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    fragment: decode(url.hash.slice(1)),
    queryEntries: Array.from(url.searchParams, ([key, value]) => ({
      key,
      value,
    })),
    opaque: !url.host && url.protocol !== "file:",
  };
  if (draft.queryEntries.length > 1000) throw new AddressError("too_large");
  return {
    url: url.href,
    draft,
    origin: url.origin,
    host: url.host,
    pathSegments: url.pathname.split("/").filter(Boolean).length,
    queryCount: draft.queryEntries.length,
  };
}
export function buildUrl(draft: UrlDraft) {
  if (draft.queryEntries.length > 1000) throw new AddressError("too_large");
  let total = 0;
  for (const value of [
    draft.protocol,
    draft.username,
    draft.password,
    draft.hostname,
    draft.port,
    draft.pathname,
    draft.fragment,
    ...draft.queryEntries.flatMap((p) => [p.key, p.value]),
  ]) {
    unicode(value);
    total += value.length;
  }
  if (total > 100000) throw new AddressError("too_large");
  if (
    [draft.protocol, draft.hostname, draft.port, draft.pathname].some((v) =>
      /[\u0000-\u001f\u007f]/.test(v),
    )
  )
    throw new AddressError("invalid_url");
  const protocol = draft.protocol.trim().replace(/:$/, "").toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(protocol))
    throw new AddressError("invalid_url");
  if (draft.port && !/^\d+$/.test(draft.port))
    throw new AddressError("invalid_port");
  if (draft.port && (Number(draft.port) < 1 || Number(draft.port) > 65535))
    throw new AddressError("invalid_port");
  let url: URL;
  try {
    if (draft.opaque) {
      if (draft.hostname || draft.port || draft.username || draft.password)
        throw new Error();
      url = new URL(
        `${protocol}:${draft.pathname.replace(/[ ?#]/g, (c) => encodeURIComponent(c))}`,
      );
      if (url.host) throw new Error();
    } else {
      if (!draft.hostname && protocol !== "file") throw new Error();
      if (
        /[\s/@?#\\]/.test(draft.hostname) ||
        (draft.hostname.includes(":") &&
          !/^\[[\da-f:.]+\]$/i.test(draft.hostname))
      )
        throw new Error();
      url = new URL(
        `${protocol}://${draft.hostname}${draft.port ? `:${draft.port}` : ""}/`,
      );
      url.username = encodeURIComponent(draft.username);
      url.password = encodeURIComponent(draft.password);
      const path = draft.pathname.startsWith("/")
        ? draft.pathname
        : `/${draft.pathname}`;
      decode(path);
      url.pathname = path;
      if (
        (draft.username && !url.username) ||
        (draft.password && !url.password)
      )
        throw new Error();
    }
    url.search = "";
    for (const p of draft.queryEntries) url.searchParams.append(p.key, p.value);
    url.hash = draft.fragment ? encodeURIComponent(draft.fragment) : "";
  } catch (e) {
    if (e instanceof AddressError) throw e;
    throw new AddressError("invalid_url");
  }
  if (url.href.length > 100000) throw new AddressError("too_large");
  return parseUrl(url.href);
}
