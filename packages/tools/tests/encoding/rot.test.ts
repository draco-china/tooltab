import { expect, it } from "vitest";
import { MAX_CODEC_TEXT, rotateText } from "../../src/encoding/rot";

it("matches every published ROT alphabet and is self-inverse", () => {
  expect(rotateText("Hello 0123456789", 13)).toBe("Uryyb 0123456789");
  expect(rotateText("Hello 0123456789", 5)).toBe("Hello 5678901234");
  expect(rotateText("Hello 0123456789", 18)).toBe("Uryyb 5678901234");
  expect(rotateText("Hello!", 47)).toBe("w6==@P");
  for (const type of [13, 5, 18, 47] as const) {
    expect(rotateText(rotateText("😀 世界 abc XYZ 123 !~\n", type), type)).toBe(
      "😀 世界 abc XYZ 123 !~\n",
    );
  }
});

it("rejects invalid Unicode, options, and oversized input", () => {
  expect(() => rotateText("\uD800")).toThrow("invalid_unicode");
  expect(() => rotateText("hello", 12 as 13)).toThrow("invalid_option");
  expect(() => rotateText("a".repeat(MAX_CODEC_TEXT + 1))).toThrow("too_large");
});
