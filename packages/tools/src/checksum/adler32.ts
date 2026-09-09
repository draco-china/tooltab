const MOD_ADLER = 65_521;
const MAX_CHUNK_BYTES = 5_552;

export type Adler32Result = {
  algorithm: "Adler-32";
  bytes: number;
  outputBits: 32;
  hex: string;
  base64: string;
  decimal: string;
  binary: string;
};

export type Adler32State = { a: number; b: number; bytes: number };

export function createAdler32State(): Adler32State {
  return { a: 1, b: 0, bytes: 0 };
}

export function updateAdler32(
  state: Adler32State,
  input: Uint8Array,
): Adler32State {
  let { a, b } = state;
  for (let offset = 0; offset < input.length; offset += MAX_CHUNK_BYTES) {
    const end = Math.min(offset + MAX_CHUNK_BYTES, input.length);
    for (let index = offset; index < end; index += 1) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      a += input[index]!;
      b += a;
    }
    a %= MOD_ADLER;
    b %= MOD_ADLER;
  }
  return { a, b, bytes: state.bytes + input.byteLength };
}

export function formatAdler32(state: Adler32State): Adler32Result {
  const checksum = ((state.b << 16) | state.a) >>> 0;
  const bytes = new Uint8Array([
    checksum >>> 24,
    checksum >>> 16,
    checksum >>> 8,
    checksum,
  ]);
  const hex = checksum.toString(16).padStart(8, "0");
  return {
    algorithm: "Adler-32",
    bytes: state.bytes,
    outputBits: 32,
    hex,
    base64: btoa(String.fromCharCode(...bytes)),
    decimal: checksum.toString(10),
    binary: checksum.toString(2).padStart(32, "0"),
  };
}
