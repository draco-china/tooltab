import { init } from "gmp-wasm/dist/mini.esm.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BASE58_ALPHABETS,
  type BaseEncodingOptions,
  MAX_BASE_BYTES,
} from "../../src/encoding/base";

// Replace only the external initialization boundary; successful calls use real WASM.
vi.mock("gmp-wasm/dist/mini.esm.js", async (original) => {
  const actual = await original<typeof import("gmp-wasm/dist/mini.esm.js")>();
  return { init: vi.fn(actual.init) };
});
beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(init).mockClear();
});

it.each(["bitcoin", "flickr", "ripple"] as const)(
  "uses real GMP for known vectors and leading zeros with %s",
  async (alphabet) => {
    const { encode58, decode58 } = await import(
      "../../src/encoding/base58-wasm"
    );
    for (const [hex, bitcoin] of [
      ["", ""],
      ["0000", "11"],
      ["01", "2"],
      ["ff", "5Q"],
      ["0061", "12g"],
      ["626262", "a3gV"],
    ]) {
      const bytes = new Uint8Array(Buffer.from(hex, "hex"));
      const encoded = Array.from(
        bitcoin,
        (char) =>
          BASE58_ALPHABETS[alphabet][BASE58_ALPHABETS.bitcoin.indexOf(char)],
      ).join("");
      expect(await encode58(bytes, { alphabet })).toBe(encoded);
      expect(await decode58(` \n${encoded}\t`, { alphabet })).toEqual(bytes);
    }
    expect(init).toHaveBeenCalledOnce();
  },
);

it("defaults to Bitcoin and rejects invalid alphabets without initializing GMP", async () => {
  const { encode58, decode58 } = await import("../../src/encoding/base58-wasm");
  for (const alphabet of ["missing", "toString", "__proto__"]) {
    const options = { alphabet } as BaseEncodingOptions;
    await expect(encode58(new Uint8Array([1]), options)).rejects.toMatchObject({
      code: "invalid-encoding",
    });
    await expect(decode58("2", options)).rejects.toMatchObject({
      code: "invalid-encoding",
    });
  }
  expect(init).not.toHaveBeenCalled();
  expect(await encode58(new Uint8Array([97]), {})).toBe("2g");
  expect(await decode58("2g", {})).toEqual(new Uint8Array([97]));
});

it.each(["0", "O", "I", "l", "😀"])(
  "rejects illegal digit %s without allocating a GMP context",
  async (source) => {
    const { decode58 } = await import("../../src/encoding/base58-wasm");
    await expect(decode58(source, {})).rejects.toMatchObject({
      code: "invalid-encoding",
    });
    expect(init).not.toHaveBeenCalled();
  },
);

it("enforces input, encoded length, leading zeros and decoded byte capacity", async () => {
  const { encode58, decode58 } = await import("../../src/encoding/base58-wasm");
  await expect(
    encode58(new Uint8Array(MAX_BASE_BYTES + 1), {}),
  ).rejects.toMatchObject({ code: "too-large" });
  await expect(
    decode58(
      "z".repeat(Math.ceil((MAX_BASE_BYTES * 8) / Math.log2(58)) + 1),
      {},
    ),
  ).rejects.toMatchObject({ code: "too-large" });
  await expect(
    decode58("1".repeat(MAX_BASE_BYTES + 1), {}),
  ).rejects.toMatchObject({ code: "too-large" });
  expect(init).not.toHaveBeenCalled();
  await expect(
    decode58(`${"1".repeat(MAX_BASE_BYTES)}2`, {}),
  ).rejects.toMatchObject({ code: "too-large" });
  const maximum = new Uint8Array(MAX_BASE_BYTES);
  maximum[MAX_BASE_BYTES - 1] = 1;
  expect(await decode58(`${"1".repeat(MAX_BASE_BYTES - 1)}2`, {})).toEqual(
    maximum,
  );
});

it("retries real initialization after an unavailable WASM engine", async () => {
  vi.mocked(init).mockRejectedValueOnce(Error("WASM unavailable"));
  const { encode58 } = await import("../../src/encoding/base58-wasm");
  await expect(encode58(new Uint8Array([97]), {})).rejects.toMatchObject({
    code: "unsupported",
  });
  expect(await encode58(new Uint8Array([97]), {})).toBe("2g");
  expect(init).toHaveBeenCalledTimes(2);
});

it("reports a native parser error and destroys the GMP context", async () => {
  const gmp = await init();
  vi.mocked(init).mockResolvedValueOnce(gmp);
  const originalContext = gmp.getContext.bind(gmp);
  const destroy = vi.fn();
  vi.spyOn(gmp, "getContext").mockImplementation(() => {
    const ctx = originalContext();
    const originalDestroy = ctx.destroy.bind(ctx);
    vi.spyOn(ctx, "destroy").mockImplementation(() => {
      destroy();
      originalDestroy();
    });
    return ctx;
  });
  vi.spyOn(gmp.binding, "mpz_set_string").mockReturnValueOnce(-1);
  const { decode58 } = await import("../../src/encoding/base58-wasm");
  await expect(decode58("2g", {})).rejects.toMatchObject({
    code: "invalid-encoding",
  });
  expect(destroy).toHaveBeenCalledOnce();
  expect(await decode58("2g", {})).toEqual(new Uint8Array([97]));
  expect(destroy).toHaveBeenCalledTimes(2);
});
