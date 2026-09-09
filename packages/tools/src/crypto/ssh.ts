import { getPublicKeyAsync } from "@noble/ed25519";
import { md5 } from "@noble/hashes/legacy.js";
import { base64, fromBase64, fromUrl64, utf8 } from "./jose-common";
export const MAX_SSH_INPUT = 8 * 1024 * 1024;
export const RSA_SIZES = [2048, 3072, 4096] as const;
export type RsaSize = (typeof RSA_SIZES)[number];
export class SshError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function text(s: string) {
  if (/[\uD800-\uDFFF]/u.test(s)) throw new SshError("invalid_unicode");
  return new TextEncoder().encode(s);
}
export function joinBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}
const uint = (value: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value);
  return b;
};
export const sshString = (value: Uint8Array | string) => {
  const bytes = typeof value === "string" ? text(value) : value;
  return joinBytes(uint(bytes.length), bytes);
};
function mpint(bytes: Uint8Array) {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  const value = bytes.subarray(i);
  return sshString(
    value[0] && value[0] >= 128 ? joinBytes(new Uint8Array([0]), value) : value,
  );
}
async function fingerprints(blob: Uint8Array) {
  const sha = new Uint8Array(
    await crypto.subtle.digest("SHA-256", blob.slice().buffer),
  );
  return {
    sha256: `SHA256:${base64(sha).replace(/=+$/, "")}`,
    md5: `MD5:${Array.from(md5(blob), (n) => n.toString(16).padStart(2, "0")).join(":")}`,
  };
}
export type GenerateOptions = {
  algorithm: "ed25519" | "rsa";
  rsaSize?: RsaSize;
  comment?: string;
};
export async function generateSsh(p: GenerateOptions) {
  const comment = p.comment ?? "";
  if (comment.length > 4096) throw new SshError("too_large");
  text(comment);
  const normalized = comment.trim().replace(/\s+/gu, " ");
  if (
    Array.from(normalized).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  )
    throw new SshError("invalid_comment");
  let publicBlob: Uint8Array, fields: Uint8Array, keyType: string, bits: number;
  if (p.algorithm === "ed25519") {
    const seed = crypto.getRandomValues(new Uint8Array(32)),
      publicKey = await getPublicKeyAsync(seed);
    keyType = "ssh-ed25519";
    bits = 256;
    publicBlob = joinBytes(sshString(keyType), sshString(publicKey));
    fields = joinBytes(
      sshString(keyType),
      sshString(publicKey),
      sshString(joinBytes(seed, publicKey)),
      sshString(normalized),
    );
    seed.fill(0);
  } else if (p.algorithm === "rsa") {
    const size = p.rsaSize ?? 4096;
    if (!RSA_SIZES.includes(size)) throw new SshError("invalid_size");
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: size,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const get = (field: "n" | "e" | "d" | "qi" | "p" | "q") => {
      const v = jwk[field];
      if (!v) throw new SshError("generation_failed");
      return mpint(fromUrl64(v));
    };
    keyType = "ssh-rsa";
    bits = size;
    publicBlob = joinBytes(sshString(keyType), get("e"), get("n"));
    fields = joinBytes(
      sshString(keyType),
      get("n"),
      get("e"),
      get("d"),
      get("qi"),
      get("p"),
      get("q"),
      sshString(normalized),
    );
  } else throw new SshError("invalid_algorithm");
  const check = crypto.getRandomValues(new Uint8Array(4)),
    unpadded = joinBytes(check, check, fields),
    padding = (8 - (unpadded.length % 8)) % 8,
    privatePart = joinBytes(
      unpadded,
      Uint8Array.from({ length: padding }, (_, i) => i + 1),
    );
  const container = joinBytes(
    text("openssh-key-v1\0"),
    sshString("none"),
    sshString("none"),
    sshString(new Uint8Array()),
    uint(1),
    sshString(publicBlob),
    sshString(privatePart),
  );
  const encoded = base64(container);
  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${encoded.match(/.{1,70}/g)?.join("\n")}\n-----END OPENSSH PRIVATE KEY-----\n`;
  fields.fill(0);
  unpadded.fill(0);
  privatePart.fill(0);
  container.fill(0);
  return {
    algorithm: p.algorithm,
    keyType,
    bits,
    comment: normalized,
    publicKey: `${keyType} ${base64(publicBlob)}${normalized ? ` ${normalized}` : ""}`,
    privateKey,
    fingerprintSha256: (await fingerprints(publicBlob)).sha256,
  };
}
class Reader {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}
  read() {
    if (this.offset + 4 > this.bytes.length) throw new SshError("invalid_blob");
    const size = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      4,
    ).getUint32(0);
    this.offset += 4;
    if (this.offset + size > this.bytes.length)
      throw new SshError("invalid_blob");
    const result = this.bytes.subarray(this.offset, this.offset + size);
    this.offset += size;
    return result;
  }
  word() {
    return utf8(this.read());
  }
  integer() {
    const b = this.read();
    if (
      !b.length ||
      b[0] >= 128 ||
      (b[0] === 0 && (b.length === 1 || b[1] < 128))
    )
      throw new SshError("invalid_blob");
    return b;
  }
  end() {
    if (this.offset !== this.bytes.length) throw new SshError("invalid_blob");
  }
}
const keyPattern = /^(?:ssh|ecdsa|sk-ssh|sk-ecdsa)-[A-Za-z0-9@.-]+$/;
function details(blob: Uint8Array, declared?: string) {
  const r = new Reader(blob),
    keyType = r.word();
  if (!keyPattern.test(keyType) || (declared && declared !== keyType))
    throw new SshError("key_type_mismatch");
  let bits: number | null = null,
    curve: string | null = null,
    checked = true;
  if (keyType === "ssh-rsa" || keyType === "ssh-dss") {
    const first = r.integer();
    const modulus = keyType === "ssh-rsa" ? r.integer() : first;
    if (keyType === "ssh-dss") {
      r.integer();
      r.integer();
      r.integer();
    }
    let i = 0;
    while (modulus[i] === 0) i++;
    bits = (modulus.length - i - 1) * 8 + 32 - Math.clz32(modulus[i]);
  } else if (
    keyType === "ssh-ed25519" ||
    keyType === "sk-ssh-ed25519@openssh.com"
  ) {
    if (r.read().length !== 32) throw new SshError("invalid_blob");
    bits = 256;
    curve = "ed25519";
    if (keyType.startsWith("sk-")) r.read();
  } else if (
    [
      "ecdsa-sha2-nistp256",
      "ecdsa-sha2-nistp384",
      "ecdsa-sha2-nistp521",
    ].includes(keyType) ||
    keyType === "sk-ecdsa-sha2-nistp256@openssh.com"
  ) {
    curve = r.word();
    bits =
      (
        { nistp256: 256, nistp384: 384, nistp521: 521 } as Record<
          string,
          number
        >
      )[curve] ?? null;
    if (!bits || !keyType.includes(curve)) throw new SshError("invalid_blob");
    const point = r.read(),
      width = Math.ceil(bits / 8);
    if (
      !(
        (point[0] === 4 && point.length === width * 2 + 1) ||
        ((point[0] === 2 || point[0] === 3) && point.length === width + 1)
      )
    )
      throw new SshError("invalid_blob");
    if (keyType.startsWith("sk-")) r.read();
  } else checked = false;
  if (checked) r.end();
  else if (r.offset === blob.length) throw new SshError("invalid_blob");
  return { keyType, bits, curve, detailsChecked: checked };
}
function tokens(line: string) {
  const result: { value: string; end: number }[] = [];
  let start = -1,
    quote = false,
    escaped = false;
  for (let i = 0; i <= line.length; i++) {
    const c = line[i];
    if (start === -1) {
      if (c !== undefined && !/\s/.test(c)) start = i;
      else continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      quote = !quote;
      continue;
    }
    if ((c === undefined || /\s/.test(c)) && !quote) {
      result.push({ value: line.slice(start, i), end: i });
      const keyIndex = keyPattern.test(result[0].value) ? 0 : 1;
      if (result.length === keyIndex + 2) return result;
      start = -1;
    }
  }
  if (quote || escaped) throw new SshError("invalid_line");
  return result;
}
export type FingerprintEntry = {
  line: number;
  keyType: string;
  bits: number | null;
  curve: string | null;
  detailsChecked: boolean;
  comment: string;
  sha256: string;
  md5: string;
};
export async function fingerprintSsh(input: string) {
  if (input.length > MAX_SSH_INPUT || text(input).length > MAX_SSH_INPUT)
    throw new SshError("too_large");
  const lines = input.split(/\r\n|\r|\n/),
    results: FingerprintEntry[] = [],
    errors: { line: number; code: string }[] = [];
  let entries = 0;
  async function append(
    body: string,
    line: number,
    comment: string,
    declared?: string,
  ) {
    try {
      const compact = body.replace(/\s/g, "");
      const bytes = fromBase64(
        compact + "=".repeat((4 - (compact.length % 4)) % 4),
      );
      results.push({
        line,
        ...details(bytes, declared),
        comment,
        ...(await fingerprints(bytes)),
      });
    } catch (e) {
      errors.push({
        line,
        code: e instanceof SshError ? e.code : "invalid_blob",
      });
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    if (++entries > 10000) throw new SshError("too_many_keys");
    const start = i + 1;
    if (/^---- BEGIN SSH2 PUBLIC KEY ----$/i.test(line)) {
      let body = "",
        comment = "",
        header = true,
        closed = false;
      for (i++; i < lines.length; i++) {
        let current = lines[i].trim();
        if (/^---- END SSH2 PUBLIC KEY ----$/i.test(current)) {
          closed = true;
          break;
        }
        if (header && current.includes(":")) {
          while (current.endsWith("\\") && i + 1 < lines.length) {
            current = current.slice(0, -1) + lines[++i];
          }
          const colon = current.indexOf(":");
          if (current.slice(0, colon).toLowerCase() === "comment") {
            comment = current.slice(colon + 1).trim();
            if (comment.startsWith('"') && comment.endsWith('"'))
              comment = comment.slice(1, -1);
          }
          continue;
        }
        header = false;
        body += current;
      }
      if (!closed) errors.push({ line: start, code: "invalid_line" });
      else await append(body, start, comment);
      continue;
    }
    try {
      const parts = tokens(line),
        index = keyPattern.test(parts[0]?.value ?? "") ? 0 : 1,
        type = parts[index],
        body = parts[index + 1];
      if (!type || !body || !keyPattern.test(type.value))
        throw new SshError("invalid_line");
      await append(body.value, start, line.slice(body.end).trim(), type.value);
    } catch {
      errors.push({ line: start, code: "invalid_line" });
    }
  }
  return { results, errors };
}
