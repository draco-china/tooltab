export const EPOCH = 1400000000;
export const MAX_TIME = EPOCH + 0xffffffff;
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export class KsuidError extends Error {
  constructor(public readonly code: "count" | "time" | "random") {
    super(code);
  }
}
export function unixSeconds(input: string | number): number {
  const n = typeof input === "string" && !input.trim() ? NaN : Number(input);
  const seconds = Math.floor(n);
  if (!Number.isFinite(n) || seconds < EPOCH || seconds > MAX_TIME)
    throw new KsuidError("time");
  return seconds;
}
export function encode(seconds: number, entropy: Uint8Array): string {
  const timestamp = unixSeconds(seconds);
  if (entropy.length !== 16) throw new KsuidError("random");
  let n = BigInt(timestamp - EPOCH);
  for (const byte of entropy) n = (n << 8n) | BigInt(byte);
  let output = "";
  for (let i = 0; i < 27; i++) {
    output = ALPHABET[Number(n % 62n)] + output;
    n /= 62n;
  }
  return output;
}
export function generate(
  count: number,
  seconds = Math.floor(Date.now() / 1000),
) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new KsuidError("count");
  const timestamp = unixSeconds(seconds);
  let random: Uint8Array;
  try {
    random = crypto.getRandomValues(new Uint8Array(16 * count));
  } catch {
    throw new KsuidError("random");
  }
  return {
    ids: Array.from({ length: count }, (_, i) =>
      encode(timestamp, random.subarray(i * 16, (i + 1) * 16)),
    ),
    count,
    timestamp,
  };
}
export function localText(seconds: number): string {
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function localSeconds(text: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text))
    throw new KsuidError("time");
  const date = new Date(text);
  const canonical = text.length === 16 ? `${text}:00` : text.split(".")[0];
  if (localText(date.getTime() / 1000) !== canonical)
    throw new KsuidError("time");
  return unixSeconds(date.getTime() / 1000);
}
