import { expect, it } from "vitest";
import {
  getStationSignal,
  type StationId,
} from "../../src/radio-timecode/encoders";
import {
  countBits,
  evenParity,
  getPair,
  splitToPairs,
  setWeightedBits,
} from "../../src/radio-timecode/encoders/utils";

it("round-trips six-bit BPC fields through ordered two-bit symbols", () => {
  for (let value = 0; value < 64; value++) {
    const pairs = splitToPairs(value, 6);
    expect(pairs).toHaveLength(3);
    expect(pairs.reduce((decoded, pair) => decoded * 4 + pair, 0)).toBe(value);
    expect(getPair(pairs, 0)).toBe(pairs[0]);
    expect(getPair(pairs, 3)).toBe(0);
  }
  expect(getPair([], 0)).toBe(0);
});

it("computes nibble population and an even parity completion bit", () => {
  for (let value = 0; value < 16; value++) {
    const bits = value.toString(2).padStart(4, "0").split("").map(Number) as (
      | 0
      | 1
    )[];
    const ones = bits.filter((bit) => bit === 1).length;
    expect(countBits(value)).toBe(ones);
    expect((ones + evenParity(bits)) % 2).toBe(0);
  }
  expect(evenParity([])).toBe(0);
});

it("updates selected weighted bits while preserving marker slots", () => {
  const bits: (0 | 1 | "M")[] = ["M", 0, 0, 0, 0];
  const mapping = [
    { pos: 1, weight: 10 },
    { pos: 2, weight: 4 },
    { pos: 3, weight: 2 },
    { pos: 4, weight: 1 },
  ];
  setWeightedBits(bits, mapping, 15);
  expect(bits).toEqual(["M", 1, 1, 0, 1]);
  setWeightedBits(bits, mapping, 2);
  expect(bits).toEqual(["M", 0, 0, 1, 0]);
});

it("preserves the unknown-station silent fallback", () => {
  expect(getStationSignal("unknown" as StationId, new Date(0))).toEqual({
    windows: [],
    symbol: "-",
  });
});
