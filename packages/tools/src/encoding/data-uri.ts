/* biome-ignore-all lint/suspicious/noControlCharactersInRegex: Reject controls in MIME and filenames. */
export const MAX_DATA_FILE = 64 * 1024 * 1024;
export const MAX_DATA_URI = MAX_DATA_FILE * 3 + 4096;
export class DataUriError extends Error {
  constructor(
    public readonly code:
      | "invalid_uri"
      | "invalid_base64"
      | "invalid_percent"
      | "invalid_unicode"
      | "invalid_mime"
      | "too_large"
      | "read_failed"
      | "only_one"
      | "unsupported",
  ) {
    super(code);
  }
}
function mimeParts(input: string) {
  const parts: string[] = [];
  let begin = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (c === '"') quoted = !quoted;
    else if (c === ";" && !quoted) {
      parts.push(input.slice(begin, i));
      begin = i + 1;
    }
  }
  if (quoted || escaped) throw new DataUriError("invalid_mime");
  parts.push(input.slice(begin));
  return parts;
}
function unquote(value: string) {
  return value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1).replace(/\\(.)/g, "$1")
    : value;
}
export function uriMediaType(input: string) {
  const parts = mimeParts(mediaType(input).mimeType);
  return parts
    .map((part, i) => {
      if (i === 0) return part;
      const index = part.indexOf("=");
      return (
        part.slice(0, index + 1) +
        encodeURIComponent(unquote(part.slice(index + 1)))
      );
    })
    .join(";");
}
export function mediaType(input: string) {
  if (input.length > 4096 || /[^\x20-\x7e]/.test(input))
    throw new DataUriError("invalid_mime");
  const parts = mimeParts(input),
    media = (parts.shift() as string).toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(media))
    throw new DataUriError("invalid_mime");
  for (const parameter of parts)
    if (
      !/^[a-z0-9!#$&^_.+-]+=(?:[^\s;",\\]+|"(?:[^"\\]|\\.)*")$/i.test(parameter)
    )
      throw new DataUriError("invalid_mime");
  return { mimeType: [media, ...parts].join(";"), mediaType: media };
}
export function parseDataUri(input: string) {
  if (input.length > MAX_DATA_URI) throw new DataUriError("too_large");
  const comma = input.indexOf(",");
  if (!/^data:/i.test(input) || comma < 0 || comma > 4096)
    throw new DataUriError("invalid_uri");
  let header = input.slice(5, comma),
    base64 = false;
  if (/(?:^|;)base64$/i.test(header)) {
    base64 = true;
    header = header.replace(/(?:^|;)base64$/i, "");
  }
  if (!header || header.startsWith(";"))
    header = `text/plain${header || ";charset=US-ASCII"}`;
  try {
    header = mimeParts(header)
      .map((part, i) => {
        if (i === 0) return decodeURIComponent(part);
        const index = part.indexOf("=");
        if (index < 1) throw new DataUriError("invalid_mime");
        const key = decodeURIComponent(part.slice(0, index)),
          value = decodeURIComponent(unquote(part.slice(index + 1)));
        if (/[^\x20-\x7e]/.test(value)) throw new DataUriError("invalid_mime");
        return `${key}=${/^[^\s;",\\]+$/.test(value) ? value : JSON.stringify(value)}`;
      })
      .join(";");
  } catch {
    throw new DataUriError("invalid_mime");
  }
  const meta = mediaType(header);
  return {
    ...meta,
    encoding: base64 ? ("base64" as const) : ("percent" as const),
    payload: input.slice(comma + 1),
  };
}
function* percentChunks(payload: string): Generator<Uint8Array> {
  let out = new Uint8Array(65536),
    length = 0;
  const encoder = new TextEncoder();
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    let bytes: Uint8Array;
    if (c === 37) {
      const pair = payload.slice(i + 1, i + 3);
      if (!/^[0-9a-f]{2}$/i.test(pair))
        throw new DataUriError("invalid_percent");
      out[length++] = parseInt(pair, 16);
      i += 2;
      if (length === out.length) {
        yield out;
        out = new Uint8Array(65536);
        length = 0;
      }
      continue;
    } else if (c < 128) {
      out[length++] = c;
      if (length === out.length) {
        yield out;
        out = new Uint8Array(65536);
        length = 0;
      }
      continue;
    } else {
      let char = payload.charAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = payload.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff))
          throw new DataUriError("invalid_unicode");
        char += payload[++i];
      } else if (c >= 0xdc00 && c <= 0xdfff)
        throw new DataUriError("invalid_unicode");
      bytes = encoder.encode(char);
    }
    for (const byte of bytes) {
      out[length++] = byte;
      if (length === out.length) {
        yield out;
        out = new Uint8Array(65536);
        length = 0;
      }
    }
  }
  if (length) yield out.slice(0, length);
}
export function* decodeChunks(parsed: ReturnType<typeof parseDataUri>) {
  let size = 0;
  if (parsed.encoding === "percent") {
    for (const chunk of percentChunks(parsed.payload)) {
      size += chunk.length;
      if (size > MAX_DATA_FILE) throw new DataUriError("too_large");
      yield chunk;
    }
    return;
  }
  let pending = "";
  for (const chunk of percentChunks(parsed.payload)) {
    for (const code of chunk) {
      if (
        code === 9 ||
        code === 10 ||
        code === 12 ||
        code === 13 ||
        code === 32
      )
        continue;
      if (code > 127) throw new DataUriError("invalid_base64");
      pending += String.fromCharCode(code);
    }
    while (pending.length > 65536) {
      const text = pending.slice(0, 65536);
      if (text.includes("=")) throw new DataUriError("invalid_base64");
      let raw: string;
      try {
        raw = atob(text);
      } catch {
        throw new DataUriError("invalid_base64");
      }
      size += raw.length;
      if (size > MAX_DATA_FILE) throw new DataUriError("too_large");
      yield Uint8Array.from(raw, (c) => c.charCodeAt(0));
      pending = pending.slice(65536);
    }
  }
  if (pending) {
    if (pending.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(pending))
      throw new DataUriError("invalid_base64");
    let raw: string;
    try {
      raw = atob(pending);
    } catch {
      throw new DataUriError("invalid_base64");
    }
    if (btoa(raw).replace(/=+$/, "") !== pending.replace(/=+$/, ""))
      throw new DataUriError("invalid_base64");
    size += raw.length;
    if (size > MAX_DATA_FILE) throw new DataUriError("too_large");
    yield Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
}
export function encodeChunk(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
export function fileDataUri(
  bytes: Uint8Array,
  type = "application/octet-stream",
) {
  if (bytes.length > MAX_DATA_FILE) throw new DataUriError("too_large");
  const mime = mediaType(type || "application/octet-stream").mimeType;
  const parts = [`data:${uriMediaType(mime)};base64,`];
  for (let i = 0; i < bytes.length; i += 49152)
    parts.push(encodeChunk(bytes.subarray(i, i + 49152)));
  return parts.join("");
}
export function filenameFor(type: string) {
  const mime = type.split(";")[0] as string,
    sub = mime.split("/")[1] ?? "";
  const known: Record<string, string> = {
    "image/svg+xml": "svg",
    "image/jpeg": "jpg",
    "audio/mpeg": "mp3",
    "text/plain": "txt",
    "text/html": "html",
    "application/octet-stream": "bin",
    "application/javascript": "js",
  };
  let ext =
    known[mime] ??
    (sub.endsWith("+json")
      ? "json"
      : sub.endsWith("+xml")
        ? "xml"
        : sub.replace(/^x-/, ""));
  if (!/^[a-z0-9]{1,16}$/.test(ext)) ext = "bin";
  return `data.${ext}`;
}
export function safeFilename(input: string, fallback: string) {
  const s = input.trim();
  if (!s) return fallback;
  if (
    s.length > 255 ||
    /[\x00-\x1f\x7f/\\:]/.test(s) ||
    s === "." ||
    s === ".."
  )
    throw new DataUriError("invalid_uri");
  return s;
}
export function previewKind(type: string) {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("text/") || /(?:json|xml|javascript)$/.test(type))
    return "text";
  return "none";
}
export function textPreview(
  bytes: Uint8Array,
  mime: string,
  truncated = false,
) {
  const charset = /;charset=(?:"([^"]*)"|([^;]*))/i.exec(mime),
    label = charset?.[1] || charset?.[2] || "utf-8";
  let decoder: TextDecoder,
    fallback = false;
  try {
    decoder = new TextDecoder(label);
  } catch {
    decoder = new TextDecoder();
    fallback = true;
  }
  const decoded = decoder.decode(bytes, { stream: truncated });
  return {
    text: decoded.slice(0, 100000),
    charset: decoder.encoding,
    charsetFallback: fallback,
    truncated: truncated || decoded.length > 100000,
  };
}
