import { validateHashByteLength } from "./input";

// Mathematical schedules from the designers’ RIPEMD-320 pseudocode; first64 steps also serve128/256.
const leftOrder = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15,
  3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11,
  5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7,
  12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
] as const;
const rightOrder = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5,
  10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0,
  4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1,
  5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
] as const;
const leftRotate = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7,
  15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5,
  12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5,
  11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
] as const;
const rightRotate = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8,
  9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14,
  13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5,
  12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
] as const;

export const RIPEMD_ALGORITHMS = [
  "RIPEMD-128",
  "RIPEMD-256",
  "RIPEMD-320",
] as const;
export type RipemdAlgorithm = (typeof RIPEMD_ALGORITHMS)[number];
const initialLeft = [
  0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0,
];
const initialRight = [
  0x76543210, 0xfedcba98, 0x89abcdef, 0x01234567, 0x3c2d1e0f,
];
const leftConstant = [0, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const rightConstant = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0];
const rotate = (v: number, n: number) => (v << n) | (v >>> (32 - n));
function nonlinear(round: number, b: number, c: number, d: number) {
  switch (round) {
    case 0:
      return b ^ c ^ d;
    case 1:
      return (b & c) | (~b & d);
    case 2:
      return (b | ~c) ^ d;
    case 3:
      return (b & d) | (c & ~d);
    default:
      return b ^ (c | ~d);
  }
}
export function littleEndianBitLength(length: number) {
  validateHashByteLength(length);
  const result = new Uint8Array(8);
  new DataView(result.buffer).setBigUint64(0, BigInt(length) * 8n, true);
  return result;
}
export function createRipemd(algorithm: RipemdAlgorithm) {
  if (!RIPEMD_ALGORITHMS.includes(algorithm)) throw Error("invalid_input");
  const laneSize = algorithm === "RIPEMD-320" ? 5 : 4;
  const rounds = laneSize;
  const combined = algorithm !== "RIPEMD-128";
  const state = new Uint32Array(
    combined
      ? [...initialLeft.slice(0, laneSize), ...initialRight.slice(0, laneSize)]
      : initialLeft.slice(0, 4),
  );
  const tail = new Uint8Array(64);
  let length = 0,
    pending = 0;
  const words = new Uint32Array(16);
  const left = new Uint32Array(laneSize);
  const right = new Uint32Array(laneSize);
  function step(
    lane: Uint32Array,
    round: number,
    word: number,
    constant: number,
    shift: number,
  ) {
    let next = rotate(
      (lane[0] +
        nonlinear(round, lane[1], lane[2], lane[3]) +
        word +
        constant) |
        0,
      shift,
    );
    if (laneSize === 5) {
      next = (next + lane[4]) | 0;
      lane[0] = lane[4];
      lane[4] = lane[3];
      lane[3] = rotate(lane[2], 10);
    } else {
      lane[0] = lane[3];
      lane[3] = lane[2];
    }
    lane[2] = lane[1];
    lane[1] = next;
  }
  function compress(target: Uint32Array, data: Uint8Array, offset: number) {
    const view = new DataView(data.buffer, data.byteOffset + offset, 64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(i * 4, true);
    for (let i = 0; i < laneSize; i++) {
      left[i] = target[i];
      right[i] = target[combined ? i + laneSize : i];
    }
    // Four/five rounds address only the complete private 80-step schedules.
    for (let round = 0; round < rounds; round++) {
      for (let i = round * 16; i < (round + 1) * 16; i++) {
        step(
          left,
          round,
          words[leftOrder[i]],
          leftConstant[round],
          leftRotate[i],
        );
        step(
          right,
          rounds - 1 - round,
          words[rightOrder[i]],
          rounds === 4 && round === 3 ? 0 : rightConstant[round],
          rightRotate[i],
        );
      }
      if (combined) {
        const index = laneSize === 4 ? round : [1, 3, 0, 2, 4][round];
        const temp = left[index];
        left[index] = right[index];
        right[index] = temp;
      }
    }
    if (combined) {
      for (let i = 0; i < laneSize; i++) {
        target[i] = (target[i] + left[i]) >>> 0;
        target[i + laneSize] = (target[i + laneSize] + right[i]) >>> 0;
      }
    } else {
      const first = target[0];
      target[0] = target[1] + left[2] + right[3];
      target[1] = target[2] + left[3] + right[0];
      target[2] = target[3] + left[0] + right[1];
      target[3] = first + left[1] + right[2];
    }
  }
  function update(bytes: Uint8Array) {
    length = validateHashByteLength(length + bytes.length);
    let offset = 0;
    if (pending) {
      const take = Math.min(64 - pending, bytes.length);
      tail.set(bytes.subarray(0, take), pending);
      pending += take;
      offset = take;
      if (pending === 64) {
        compress(state, tail, 0);
        pending = 0;
      }
    }
    while (offset + 64 <= bytes.length) {
      compress(state, bytes, offset);
      offset += 64;
    }
    if (offset < bytes.length) {
      tail.set(bytes.subarray(offset), 0);
      pending = bytes.length - offset;
    }
  }
  function digest(format: "binary"): Uint8Array<ArrayBuffer>;
  function digest(format?: "hex"): string;
  function digest(format: "hex" | "binary" = "hex") {
    const padded = new Uint8Array(pending < 56 ? 64 : 128);
    padded.set(tail.subarray(0, pending));
    padded[pending] = 128;
    padded.set(littleEndianBitLength(length), padded.length - 8);
    const final = state.slice();
    for (let i = 0; i < padded.length; i += 64) compress(final, padded, i);
    const result = new Uint8Array(state.length * 4),
      view = new DataView(result.buffer);
    final.forEach((n, i) => {
      view.setUint32(i * 4, n, true);
    });
    return format === "binary"
      ? result
      : Array.from(result, (n) => n.toString(16).padStart(2, "0")).join("");
  }
  return { update, digest };
}
