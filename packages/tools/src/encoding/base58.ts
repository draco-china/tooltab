import { BASE58_ALPHABETS } from "./base-contract";

export type Base58AlphabetKey = keyof typeof BASE58_ALPHABETS;
export type Base58Options = Readonly<{ alphabet?: string }>;
const DEFAULT_BASE58_ALPHABET_KEY = "bitcoin";
const DEFAULT_BASE58_ALPHABET = BASE58_ALPHABETS.bitcoin;

export function normalizeBase58Input(value: string) {
  return value.replace(/\s+/gu, "");
}

function getAlphabetMap(alphabet?: string) {
  const resolvedAlphabet = alphabet ?? DEFAULT_BASE58_ALPHABET;
  if (resolvedAlphabet.length !== 58)
    throw new Error("Invalid Base58 alphabet");
  const map = new Map<string, number>();
  for (let index = 0; index < resolvedAlphabet.length; index += 1) {
    const character = resolvedAlphabet.charAt(index);
    if (map.has(character)) throw new Error("Invalid Base58 alphabet");
    map.set(character, index);
  }
  return { alphabet: resolvedAlphabet, map };
}

export function resolveBase58AlphabetKey(value: string): Base58AlphabetKey {
  return Object.hasOwn(BASE58_ALPHABETS, value)
    ? (value as Base58AlphabetKey)
    : DEFAULT_BASE58_ALPHABET_KEY;
}

export function decodeBase58(
  value: string,
  options: Base58Options = {},
): Uint8Array<ArrayBuffer> {
  const { alphabet, map } = getAlphabetMap(options.alphabet);
  const normalized = normalizeBase58Input(value);
  if (!normalized) return new Uint8Array();
  const bytes = [0];
  for (const character of normalized) {
    const characterValue = map.get(character);
    if (characterValue === undefined)
      throw new Error("Invalid Base58 character");
    let carry = characterValue;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += (bytes[index] as number) * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (
    let index = 0;
    index < normalized.length &&
    normalized.charAt(index) === alphabet.charAt(0) &&
    index < normalized.length - 1;
    index += 1
  ) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}
