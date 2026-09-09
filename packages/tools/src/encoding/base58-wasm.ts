// Include the ambient declaration for this untyped package entry without a runtime import.
/// <reference path="./gmp-mini.d.ts" />
import { init } from "gmp-wasm/dist/mini.esm.js";
import {
  BASE58_ALPHABETS,
  BaseEncodingError,
  type BaseEncodingOptions,
  MAX_BASE_BYTES,
} from "./base-contract";

let engine: ReturnType<typeof init> | undefined;
const GMP_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv";
function alphabetFor(options: BaseEncodingOptions) {
  const key = options.alphabet ?? "bitcoin";
  if (!Object.hasOwn(BASE58_ALPHABETS, key))
    throw new BaseEncodingError("invalid-encoding");
  return BASE58_ALPHABETS[key];
}
async function context() {
  try {
    engine ??= init();
    const gmp = await engine;
    return { gmp, ctx: gmp.getContext() };
  } catch {
    engine = undefined;
    throw new BaseEncodingError("unsupported");
  }
}
export async function encode58(
  bytes: Uint8Array,
  options: BaseEncodingOptions,
): Promise<string> {
  if (bytes.length > MAX_BASE_BYTES) throw new BaseEncodingError("too-large");
  const alphabet = alphabetFor(options);
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes++;
  if (zeroes === bytes.length) return alphabet[0].repeat(zeroes);
  const hex = Array.from(bytes.subarray(zeroes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const { ctx } = await context();
  try {
    // GMP Integer.toString supports base 58; this is not Number.toString.
    const digits = ctx.Integer(hex, 16).toString(58);
    return (
      alphabet[0].repeat(zeroes) +
      Array.from(digits, (char) => alphabet[GMP_DIGITS.indexOf(char)]).join("")
    );
  } finally {
    ctx.destroy();
  }
}
export async function decode58(
  source: string,
  options: BaseEncodingOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const alphabet = alphabetFor(options);
  const text = source.replace(/\s/g, "");
  if (text.length > Math.ceil((MAX_BASE_BYTES * 8) / Math.log2(58)))
    throw new BaseEncodingError("too-large");
  const digits = Array.from(text, (char) => {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new BaseEncodingError("invalid-encoding");
    return GMP_DIGITS[index];
  }).join("");
  let zeroes = 0;
  while (zeroes < digits.length && digits[zeroes] === "0") zeroes++;
  if (zeroes > MAX_BASE_BYTES) throw new BaseEncodingError("too-large");
  if (zeroes === digits.length) return new Uint8Array(zeroes);
  const { gmp, ctx } = await context();
  try {
    const integer = ctx.Integer(0);
    // GMP supports bases through 62; the package's high-level constructor stops at 36.
    if (
      gmp.binding.mpz_set_string(integer.mpz_t, digits.slice(zeroes), 58) !== 0
    )
      throw new BaseEncodingError("invalid-encoding");
    let hex = integer.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    if (zeroes + hex.length / 2 > MAX_BASE_BYTES)
      throw new BaseEncodingError("too-large");
    const bytes = new Uint8Array(zeroes + hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
      bytes[zeroes + i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    return bytes;
  } finally {
    ctx.destroy();
  }
}
