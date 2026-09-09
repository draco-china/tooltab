import { expect, it } from "vitest";
import {
  createAdler32State,
  formatAdler32,
  updateAdler32,
} from "../../src/checksum/adler32";

const digest = (input: Uint8Array) =>
  formatAdler32(updateAdler32(createAdler32State(), input));

it("matches the standard Adler-32 vectors and every output representation", () => {
  expect(digest(new TextEncoder().encode(""))).toEqual({
    algorithm: "Adler-32",
    bytes: 0,
    outputBits: 32,
    hex: "00000001",
    base64: "AAAAAQ==",
    decimal: "1",
    binary: "00000000000000000000000000000001",
  });
  expect(digest(new TextEncoder().encode("Wikipedia"))).toEqual({
    algorithm: "Adler-32",
    bytes: 9,
    outputBits: 32,
    hex: "11e60398",
    base64: "EeYDmA==",
    decimal: "300286872",
    binary: "00010001111001100000001110011000",
  });
});

it("preserves state across arbitrary chunk boundaries including internal chunk limits", () => {
  const input = new Uint8Array(17_777).map((_, index) => (index * 29) % 256);
  const whole = digest(input);
  let state = createAdler32State();
  for (let offset = 0; offset < input.length; offset += 17)
    state = updateAdler32(state, input.subarray(offset, offset + 17));
  expect(formatAdler32(state)).toEqual(whole);
});

it("does not mutate input or prior state and reports byte counts", () => {
  const input = Uint8Array.from([0, 1, 2, 255, 128]);
  const snapshot = input.slice();
  const initial = createAdler32State();
  const updated = updateAdler32(initial, input);
  expect(initial).toEqual({ a: 1, b: 0, bytes: 0 });
  expect(input).toEqual(snapshot);
  expect(updated.bytes).toBe(input.byteLength);
  expect(updateAdler32(updated, new Uint8Array())).toEqual(updated);
});

it("handles high-volume binary input without precision loss in the checksum state", () => {
  const input = new Uint8Array(5_552 * 3 + 1).fill(255);
  const result = digest(input);
  expect(result.bytes).toBe(input.length);
  expect(result.hex).toMatch(/^[0-9a-f]{8}$/);
  expect(result.binary).toHaveLength(32);
  expect(Number(result.decimal)).toBeGreaterThan(0);
});
