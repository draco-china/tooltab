import { validateHashByteLength } from "./input";

export const SIPHASH_ALGORITHMS = ["SipHash-2-4", "SipHash-128-2-4"] as const;
export type SipHashAlgorithm = (typeof SIPHASH_ALGORITHMS)[number];
export class SipHashKeyError extends Error {
  constructor() {
    super("invalid_key");
  }
}
export function parseSipHashKey(input: string): Uint8Array<ArrayBuffer> {
  if (input.length > 4096) throw new SipHashKeyError();
  const hex = input
    .trim()
    .replace(/^0x/i, "")
    .replace(/[\s:_-]/g, "");
  if (!/^[\da-f]{32}$/i.test(hex)) throw new SipHashKeyError();
  return Uint8Array.from({ length: 16 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}
export function randomSipHashKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
// Each word occupies [low32, high32]. Addition is exact with one carry.
function add(s: Uint32Array, a: number, b: number) {
  const low = s[a] + s[b];
  s[a + 1] = s[a + 1] + s[b + 1] + (low > 0xffffffff ? 1 : 0);
  s[a] = low;
}
function rotate(s: Uint32Array, a: number, n: number) {
  const low = s[a],
    high = s[a + 1];
  if (n === 32) {
    s[a] = high;
    s[a + 1] = low;
  } else {
    s[a] = (low << n) | (high >>> (32 - n));
    s[a + 1] = (high << n) | (low >>> (32 - n));
  }
}
function xor(s: Uint32Array, a: number, b: number) {
  s[a] ^= s[b];
  s[a + 1] ^= s[b + 1];
}
function rounds(s: Uint32Array, count: number) {
  for (let i = 0; i < count; i++) {
    add(s, 0, 2);
    rotate(s, 2, 13);
    xor(s, 2, 0);
    rotate(s, 0, 32);
    add(s, 4, 6);
    rotate(s, 6, 16);
    xor(s, 6, 4);
    add(s, 0, 6);
    rotate(s, 6, 21);
    xor(s, 6, 0);
    add(s, 4, 2);
    rotate(s, 2, 17);
    xor(s, 2, 4);
    rotate(s, 4, 32);
  }
}
function compress(s: Uint32Array, low: number, high: number) {
  s[6] ^= low;
  s[7] ^= high;
  rounds(s, 2);
  s[0] ^= low;
  s[1] ^= high;
}
export function createSipHash(algorithm: SipHashAlgorithm, key: Uint8Array) {
  if (!SIPHASH_ALGORITHMS.includes(algorithm) || key.length !== 16)
    throw new SipHashKeyError();
  const wide = algorithm === "SipHash-128-2-4";
  const state = new Uint32Array([
    0x70736575, 0x736f6d65, 0x6e646f6d, 0x646f7261, 0x6e657261, 0x6c796765,
    0x79746573, 0x74656462,
  ]);
  const k = new DataView(key.buffer, key.byteOffset, 16);
  for (let i = 0; i < 8; i++) state[i] ^= k.getUint32((i % 4) * 4, true);
  if (wide) state[2] ^= 0xee;
  const tail = new Uint8Array(8);
  let pending = 0,
    length = 0;
  function update(data: Uint8Array) {
    length = validateHashByteLength(length + data.length);
    let offset = 0;
    if (pending) {
      const take = Math.min(8 - pending, data.length);
      tail.set(data.subarray(0, take), pending);
      pending += take;
      offset = take;
      if (pending === 8) {
        const v = new DataView(tail.buffer);
        compress(state, v.getUint32(0, true), v.getUint32(4, true));
        pending = 0;
      }
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    while (offset + 8 <= data.length) {
      compress(
        state,
        view.getUint32(offset, true),
        view.getUint32(offset + 4, true),
      );
      offset += 8;
    }
    if (offset < data.length) {
      tail.set(data.subarray(offset));
      pending = data.length - offset;
    }
  }
  function digest(format: "binary"): Uint8Array<ArrayBuffer>;
  function digest(format?: "hex"): string;
  function digest(format: "binary" | "hex" = "hex") {
    const final = state.slice(),
      block = new Uint8Array(8);
    block.set(tail.subarray(0, pending));
    block[7] = length % 256;
    const view = new DataView(block.buffer);
    compress(final, view.getUint32(0, true), view.getUint32(4, true));
    final[4] ^= wide ? 0xee : 0xff;
    rounds(final, 4);
    const result = new Uint8Array(wide ? 16 : 8),
      out = new DataView(result.buffer);
    function write(offset: number) {
      out.setUint32(offset, final[1] ^ final[3] ^ final[5] ^ final[7]);
      out.setUint32(offset + 4, final[0] ^ final[2] ^ final[4] ^ final[6]);
    }
    write(0);
    if (wide) {
      final[2] ^= 0xdd;
      rounds(final, 4);
      write(8);
    }
    return format === "binary"
      ? result
      : Array.from(result, (n) => n.toString(16).padStart(2, "0")).join("");
  }
  return { update, digest };
}
