import { expect, it, vi } from "vitest";

vi.mock("diff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("diff")>();
  return {
    ...actual,
    diffArrays: vi.fn(() => undefined),
    diffWordsWithSpace: vi.fn(() => undefined),
  };
});

import { analyzeText } from "../../src/text/analysis";

it("maps a timed out line diff to the public timeout error", () => {
  expect(() =>
    analyzeText({ kind: "diff", original: "a", modified: "b" }),
  ).toThrow("timeout");
});

it("maps a timed out inline diff to the public timeout error", async () => {
  const { diffWordsWithSpace } = await import("diff");
  const arrays = await import("diff");
  vi.mocked(arrays.diffArrays).mockReturnValue([
    { removed: true, added: false, count: 1, value: ["a"] },
    { added: true, removed: false, count: 1, value: ["b"] },
  ] as never);
  vi.mocked(diffWordsWithSpace).mockReturnValue(undefined as never);
  expect(() =>
    analyzeText({ kind: "diff", original: "a", modified: "b" }),
  ).toThrow("timeout");
});
