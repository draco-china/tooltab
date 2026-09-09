import { expect, it } from "vitest";
import {
  createCrcEngine,
  FILTERS,
  filterResults,
  MODELS,
  resultText,
} from "../../src/checksum/crc";
import vectors from "./crc-checksum-vectors.json";

it("matches all 19 RevEng check 123456789 vectors plus explicit CRC1 compatibility", () => {
  const engine = createCrcEngine();
  engine.update(new TextEncoder().encode("123456789"));
  const results = engine.results();
  expect(results).toHaveLength(20);
  for (const m of MODELS)
    expect(results.find((r) => r.id === m.id)?.hex).toBe(m.check);
  expect(results[0]?.hex).toBe("1");
  const parity = createCrcEngine();
  parity.update(new Uint8Array([128]));
  expect(parity.results()[0]?.hex).toBe("0");
});

it("matches independently bit-serial generated empty/high-bit binary vectors, including reflected 64-bit models", () => {
  for (const [key, data] of [
    ["empty", new Uint8Array()],
    ["high", new Uint8Array([128, 255, 0, 1, 127])],
  ] as const) {
    const engine = createCrcEngine();
    engine.update(data);
    for (const r of engine.results().slice(1))
      expect(r.hex).toBe(
        (vectors as Record<string, { empty: string; high: string }>)[r.id]?.[
          key
        ],
      );
  }
});

it("keeps 64-bit crossword state across nonaligned chunks and repeated digest reads", () => {
  const bytes = new Uint8Array(65539).map((_, i) => i % 251);
  const whole = createCrcEngine();
  whole.update(bytes);
  const split = createCrcEngine();
  for (let i = 0; i < bytes.length; i += 13)
    split.update(bytes.subarray(i, i + 13));
  expect(split.results()).toEqual(whole.results());
  expect(split.results()).toEqual(whole.results());
});

it("retains all filter groups and visible copy text", () => {
  const engine = createCrcEngine();
  const r = engine.results();
  expect(FILTERS.map((f) => filterResults(r, f).length)).toEqual([
    20, 3, 5, 3, 7, 2,
  ]);
  expect(resultText(filterResults(r, "other"))).toBe("CRC1: 0\nCRC24: b704ce");
});

it("keeps defensive guards when the public model list is externally mutated", () => {
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const model = MODELS[0]!;
  MODELS.push(model);
  try {
    expect(() => createCrcEngine().update(new Uint8Array())).toThrow("model");
  } finally {
    MODELS.pop();
  }

  const engine = createCrcEngine();
  MODELS.push(model);
  try {
    expect(() => engine.results()).toThrow("state");
  } finally {
    MODELS.pop();
  }
});
