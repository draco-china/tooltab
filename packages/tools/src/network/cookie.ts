export const MAX_HTTP_TEXT = 100_000;
export class HttpTextError extends Error {
  constructor(public readonly code: "too_large" | "invalid_header") {
    super(code);
  }
}
export interface CookieAttribute {
  name: string;
  value: string | null;
  raw: string;
}
export interface ParsedCookie {
  name: string;
  value: string;
  attributes: CookieAttribute[];
  raw: string;
}
const tokenPattern = /^[!#$%&'*+\-.^_`|~\da-z]+$/i;
export function parseCookieHeaders(
  input: string,
  type: "cookie" | "set-cookie",
) {
  if (input.length > MAX_HTTP_TEXT) throw new HttpTextError("too_large");
  if (type !== "cookie" && type !== "set-cookie")
    throw new HttpTextError("invalid_header");
  const cookies: ParsedCookie[] = [];
  const invalid: { fragment: string; reason: string }[] = [];
  const pair = (fragment: string) => {
    const eq = fragment.indexOf("=");
    if (eq < 1) return null;
    const name = fragment.slice(0, eq).trim(),
      value = fragment.slice(eq + 1).trim();
    const content =
      value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    if (
      !tokenPattern.test(name) ||
      !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(content)
    )
      return null;
    return { name, value };
  };
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = /^(Cookie|Set-Cookie)\s*:/i.exec(line);
    if (header && header[1]?.toLowerCase() !== type) {
      invalid.push({ fragment: rawLine, reason: "wrong_header_type" });
      continue;
    }
    const value = header ? line.slice(header[0].length).trim() : line;
    const fragments = value.split(";");
    if (type === "cookie") {
      for (const raw of fragments) {
        const part = raw.trim();
        const parsed = pair(part);
        if (parsed) cookies.push({ ...parsed, attributes: [], raw });
        else invalid.push({ fragment: raw, reason: "invalid_cookie_pair" });
      }
    } else {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const first = fragments.shift()!;
      const parsed = pair(first.trim());
      if (!parsed) {
        invalid.push({ fragment: rawLine, reason: "invalid_cookie_pair" });
        continue;
      }
      const attributes: CookieAttribute[] = [];
      for (const raw of fragments) {
        const part = raw.trim(),
          eq = part.indexOf("="),
          name = eq < 0 ? part : part.slice(0, eq).trim(),
          attrValue = eq < 0 ? null : part.slice(eq + 1).trim();
        if (
          !tokenPattern.test(name) ||
          Array.from(attrValue ?? "").some(
            (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
          ) ||
          (attrValue?.includes(",") && name.toLowerCase() !== "expires") ||
          (name.toLowerCase() === "expires" &&
            (!attrValue || Number.isNaN(Date.parse(attrValue))))
        ) {
          invalid.push({ fragment: raw, reason: "invalid_attribute" });
          continue;
        }
        attributes.push({ name, value: attrValue, raw });
      }
      cookies.push({ ...parsed, attributes, raw: rawLine });
    }
  }
  return { cookies, invalid };
}
