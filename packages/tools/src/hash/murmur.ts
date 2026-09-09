import { validateHashByteLength } from "./input";

export const MURMUR_ALGORITHMS = [
  "Murmur3-x86-32",
  "Murmur3-x86-128",
  "Murmur3-x64-128",
] as const;

export type MurmurAlgorithm = (typeof MURMUR_ALGORITHMS)[number];

export class MurmurSeedError extends Error {
  constructor() {
    super("invalid_seed");
    this.name = "MurmurSeedError";
  }
}

export function parseMurmurSeed(input: string): number {
  if (input.length > 4096) throw new MurmurSeedError();
  const seed = input.trim();
  if (!seed) return 0;
  if (!/^(?:[0-9]+|0[xX][0-9a-fA-F]+)$/.test(seed)) throw new MurmurSeedError();
  return Number(BigInt(seed) & 0xffffffffn);
}

type U64 = { lo: number; hi: number };
const u64 = (lo: number, hi = 0): U64 => ({ lo: lo >>> 0, hi: hi >>> 0 });
const xor = (a: U64, b: U64) => u64(a.lo ^ b.lo, a.hi ^ b.hi);
const add = (a: U64, b: U64) => {
  const sum = a.lo + b.lo;
  return u64(sum, a.hi + b.hi + (sum >= 4294967296 ? 1 : 0));
};

function multiply64(a: U64, b: U64): U64 {
  const low = (a.lo & 65535) * (b.lo & 65535);
  const middle =
    (low >>> 16) +
    (a.lo >>> 16) * (b.lo & 65535) +
    (a.lo & 65535) * (b.lo >>> 16);
  return u64(
    (low & 65535) | ((middle & 65535) << 16),
    (a.lo >>> 16) * (b.lo >>> 16) +
      Math.floor(middle / 65536) +
      Math.imul(a.hi, b.lo) +
      Math.imul(a.lo, b.hi),
  );
}

const rotate64 = (a: U64, n: number): U64 =>
  n < 32
    ? u64((a.lo << n) | (a.hi >>> (32 - n)), (a.hi << n) | (a.lo >>> (32 - n)))
    : u64(
        (a.hi << (n - 32)) | (a.lo >>> (64 - n)),
        (a.lo << (n - 32)) | (a.hi >>> (64 - n)),
      );
const rotate32 = (value: number, n: number) =>
  (value << n) | (value >>> (32 - n));
const mix32 = (value: number) => {
  let hash = value ^ (value >>> 16);
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
};
function mix64(value: U64): U64 {
  let hash = xor(value, u64(value.hi >>> 1));
  hash = multiply64(hash, u64(0xed558ccd, 0xff51afd7));
  hash = xor(hash, u64(hash.hi >>> 1));
  hash = multiply64(hash, u64(0x1a85ec53, 0xc4ceb9fe));
  return xor(hash, u64(hash.hi >>> 1));
}

function length64(bytes: number): U64 {
  return u64(bytes, Math.floor(bytes / 4294967296));
}

function word(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

const c64a = u64(0x114253d5, 0x87c37b91);
const c64b = u64(0x2745937f, 0x4cf5ad43);
const constants = [0x239b961b, 0xab0e9789, 0x38b34ae5, 0xa1e38b93] as const;
const rounds = [19, 17, 15, 13] as const;
const additions = [0x561ccd1b, 0x0bcaa747, 0x96cd1c35, 0x32ac3b17] as const;
function key32(key: number, index: number): number {
  return Math.imul(
    rotate32(Math.imul(key, constants[index]), 15 + index),
    constants[(index + 1) % 4],
  );
}
const key64 = (key: U64, second: boolean) =>
  multiply64(
    rotate64(multiply64(key, second ? c64b : c64a), second ? 33 : 31),
    second ? c64a : c64b,
  );

export type MurmurHasher = {
  update(bytes: Uint8Array): void;
  digest(format: "binary"): Uint8Array;
  digest(format?: "hex"): string;
};

/** Incremental state machine for the public-domain SMHasher Murmur3 variants. */
export function createMurmur(
  algorithm: MurmurAlgorithm,
  seed = 0,
): MurmurHasher {
  if (
    !MURMUR_ALGORITHMS.includes(algorithm) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new MurmurSeedError();

  const blockSize = algorithm === "Murmur3-x86-32" ? 4 : 16;
  const hash = new Uint32Array(4).fill(seed);
  let first = u64(seed);
  let second = u64(seed);
  let length = 0;
  let pending = 0;
  const tail = new Uint8Array(16);

  function block(bytes: Uint8Array, offset: number): void {
    if (algorithm === "Murmur3-x86-32") {
      const key = Math.imul(
        rotate32(Math.imul(word(bytes, offset), 0xcc9e2d51), 15),
        0x1b873593,
      );
      hash[0] = (Math.imul(rotate32(hash[0] ^ key, 13), 5) + 0xe6546b64) >>> 0;
    } else if (algorithm === "Murmur3-x86-128") {
      for (let index = 0; index < 4; index++) {
        const value = rotate32(
          hash[index] ^ key32(word(bytes, offset + index * 4), index),
          rounds[index],
        );
        hash[index] =
          (Math.imul((value + hash[(index + 1) % 4]) | 0, 5) +
            additions[index]) >>>
          0;
      }
    } else {
      first = xor(
        first,
        key64(u64(word(bytes, offset), word(bytes, offset + 4)), false),
      );
      first = add(
        multiply64(add(rotate64(first, 27), second), u64(5)),
        u64(0x52dce729),
      );
      second = xor(
        second,
        key64(u64(word(bytes, offset + 8), word(bytes, offset + 12)), true),
      );
      second = add(
        multiply64(add(rotate64(second, 31), first), u64(5)),
        u64(0x38495ab5),
      );
    }
  }

  function update(bytes: Uint8Array): void {
    length = validateHashByteLength(length + bytes.length);
    let offset = 0;
    if (pending) {
      const copied = Math.min(blockSize - pending, bytes.length);
      tail.set(bytes.subarray(0, copied), pending);
      pending += copied;
      offset = copied;
      if (pending === blockSize) {
        block(tail, 0);
        pending = 0;
      }
    }
    while (offset + blockSize <= bytes.length) {
      block(bytes, offset);
      offset += blockSize;
    }
    if (offset < bytes.length) {
      tail.set(bytes.subarray(offset), 0);
      pending = bytes.length - offset;
    }
  }

  function digest(format: "hex" | "binary" = "hex"): string | Uint8Array {
    const rest = new Uint8Array(16);
    rest.set(tail.subarray(0, pending));
    const state = hash.slice();
    let words: number[];
    if (algorithm === "Murmur3-x86-32") {
      if (pending)
        state[0] ^= Math.imul(
          rotate32(Math.imul(word(rest, 0), 0xcc9e2d51), 15),
          0x1b873593,
        );
      words = [mix32(state[0] ^ length)];
    } else if (algorithm === "Murmur3-x86-128") {
      for (let index = 0; index < 4; index++) {
        if (pending > index * 4)
          state[index] ^= key32(word(rest, index * 4), index);
        state[index] ^= length;
      }
      state[0] = (state[0] + state[1] + state[2] + state[3]) >>> 0;
      for (let index = 1; index < 4; index++)
        state[index] = (state[index] + state[0]) >>> 0;
      for (let index = 0; index < 4; index++)
        state[index] = mix32(state[index]);
      state[0] = (state[0] + state[1] + state[2] + state[3]) >>> 0;
      for (let index = 1; index < 4; index++)
        state[index] = (state[index] + state[0]) >>> 0;
      words = Array.from(state);
    } else {
      let firstHash = first;
      let secondHash = second;
      if (pending > 8)
        secondHash = xor(
          secondHash,
          key64(u64(word(rest, 8), word(rest, 12)), true),
        );
      if (pending)
        firstHash = xor(
          firstHash,
          key64(u64(word(rest, 0), word(rest, 4)), false),
        );
      firstHash = xor(firstHash, length64(length));
      secondHash = xor(secondHash, length64(length));
      firstHash = add(firstHash, secondHash);
      secondHash = add(secondHash, firstHash);
      firstHash = mix64(firstHash);
      secondHash = mix64(secondHash);
      firstHash = add(firstHash, secondHash);
      secondHash = add(secondHash, firstHash);
      words = [firstHash.hi, firstHash.lo, secondHash.hi, secondHash.lo];
    }
    const bytes = new Uint8Array(words.length * 4);
    const view = new DataView(bytes.buffer);
    words.forEach((value, index) => {
      view.setUint32(index * 4, value, false);
    });
    return format === "binary"
      ? bytes
      : Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
          "",
        );
  }

  return { update, digest } as MurmurHasher;
}
