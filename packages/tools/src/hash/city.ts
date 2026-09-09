const K0 = 0xc3a5c85c97cb3127n,
  K1 = 0xb492b66fbe98f273n,
  K2 = 0x9ae16a3b2f90404fn;
const u = (n: bigint) => BigInt.asUintN(64, n);
const r = (n: bigint, s: bigint) => u((u(n) >> s) | (u(n) << (64n - s)));
const mix = (n: bigint) => u(n) ^ (u(n) >> 47n);
function fold(a: bigint, b: bigint, m = 0x9ddfea08eb382d69n) {
  const x = mix(u((u(a) ^ u(b)) * m));
  return u(mix(u((u(b) ^ x) * m)) * m);
}
function swap(n: bigint) {
  let result = 0n;
  for (let i = 0n; i < 64n; i += 8n)
    result = (result << 8n) | ((u(n) >> i) & 255n);
  return result;
}
function read(bytes: Uint8Array, offset: number) {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.length,
  ).getBigUint64(offset, true);
}
function weak(
  bytes: Uint8Array,
  offset: number,
  a: bigint,
  b: bigint,
): [bigint, bigint] {
  a = u(a + read(bytes, offset));
  b = r(b + a + read(bytes, offset + 24), 21n);
  const c = a;
  a = u(a + read(bytes, offset + 8) + read(bytes, offset + 16));
  return [u(a + read(bytes, offset + 24)), u(b + r(a, 44n) + c)];
}
function short(bytes: Uint8Array) {
  const len = bytes.length,
    n = BigInt(len),
    m = u(K2 + n * 2n),
    f = (i: number) => read(bytes, i);
  if (len <= 16) {
    if (len >= 8) {
      const a = u(f(0) + K2),
        b = f(len - 8);
      return fold(u(r(b, 37n) * m + a), u((r(a, 25n) + b) * m), m);
    }
    if (len >= 4) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, len);
      return fold(
        n + (BigInt(view.getUint32(0, true)) << 3n),
        BigInt(view.getUint32(len - 4, true)),
        m,
      );
    }
    if (len === 0) return K2;
    return u(
      mix(
        u(BigInt(bytes[0] + (bytes[len >> 1] << 8)) * K2) ^
          u(BigInt(len + (bytes[len - 1] << 2)) * K0),
      ) * K2,
    );
  }
  if (len <= 32) {
    const a = u(f(0) * K1),
      b = f(8),
      c = u(f(len - 8) * m),
      d = u(f(len - 16) * K2);
    return fold(u(r(a + b, 43n) + r(c, 30n) + d), u(a + r(b + K2, 18n) + c), m);
  }
  const a = u(f(0) * K2),
    b = f(8),
    c = f(len - 24),
    d = f(len - 32),
    e = u(f(16) * K2),
    f0 = u(f(24) * 9n),
    g = f(len - 8),
    h = u(f(len - 16) * m);
  const q = u(r(a + g, 43n) + (r(b, 30n) + c) * 9n),
    v = u((u(a + g) ^ d) + f0 + 1n),
    w = u(swap(u((q + v) * m)) + h),
    x = u(r(e + f0, 42n) + c),
    y = u((swap(u((v + w) * m)) + g) * m),
    z = u(e + f0 + c),
    aa = u(swap(u((x + z) * m + y)) + b);
  return u(mix(u((z + aa) * m + d + h)) * m + x);
}
export class CitySeedError extends Error {
  constructor() {
    super("invalid_seed");
  }
}
export function parseCitySeed(input: string): bigint | null {
  if (input.length > 4096) throw new CitySeedError();
  const s = input.trim();
  if (!s) return null;
  if (!/^(?:\d+|0x[\da-f]+)$/i.test(s)) throw new CitySeedError();
  return u(BigInt(s));
}
export type CityPrelude = {
  length: number;
  first: Uint8Array;
  last: Uint8Array;
};
/** CityHash needs its suffix before processing the prefix: caller must use a stable random-access source. */
export function createCityHash(p: CityPrelude, seed: bigint | null = null) {
  const { length, first, last } = p;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 2 ** 40 ||
    first.length !== Math.min(8, length) ||
    last.length !== Math.min(64, length)
  )
    throw Error("invalid_input");
  let x = 0n,
    y = 0n,
    z = 0n,
    v: [bigint, bigint] = [0n, 0n],
    w: [bigint, bigint] = [0n, 0n];
  if (length > 64) {
    x = read(last, 24);
    y = u(read(last, 48) + read(last, 8));
    z = fold(u(read(last, 16) + BigInt(length)), read(last, 40));
    v = weak(last, 0, BigInt(length), z);
    w = weak(last, 32, u(y + K1), x);
    x = u(x * K1 + read(first, 0));
  }
  const blocks = Math.floor((length - 1) / 64),
    tail = new Uint8Array(64);
  let received = 0,
    pending = 0,
    processed = 0;
  function block(b: Uint8Array) {
    x = u(r(x + y + v[0] + read(b, 8), 37n) * K1);
    y = u(r(y + v[1] + read(b, 48), 42n) * K1);
    x ^= w[1];
    y = u(y + v[0] + read(b, 40));
    z = u(r(z + w[0], 33n) * K1);
    v = weak(b, 0, u(v[1] * K1), u(x + w[0]));
    w = weak(b, 32, u(z + w[1]), u(y + read(b, 16)));
    [z, x] = [x, z];
    processed++;
  }
  function update(b: Uint8Array) {
    if (received + b.length > length) throw Error("invalid_input");
    received += b.length;
    if (length <= 64) return;
    let offset = 0;
    while (offset < b.length && processed < blocks) {
      const take = Math.min(64 - pending, b.length - offset);
      tail.set(b.subarray(offset, offset + take), pending);
      offset += take;
      pending += take;
      if (pending === 64) {
        block(tail);
        pending = 0;
      }
    }
  }
  function digest(format: "binary"): Uint8Array<ArrayBuffer>;
  function digest(format?: "hex"): string;
  function digest(format: "binary" | "hex" = "hex") {
    if (received !== length) throw Error("invalid_input");
    let value =
      length <= 64
        ? short(last)
        : fold(u(fold(v[0], w[0]) + mix(y) * K1 + z), u(fold(v[1], w[1]) + x));
    if (seed !== null) value = fold(u(value - K2), u(seed));
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, value);
    return format === "binary" ? out : value.toString(16).padStart(16, "0");
  }
  return { update, digest };
}
