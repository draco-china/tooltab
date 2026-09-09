import { expect, it } from "vitest";
import {
  MAX_UTILITY_INPUT,
  MAX_UTILITY_OUTPUT,
  TextUtilityError,
  textBuilder,
  validateText,
} from "../../src/text/shared";

it("validates type, Unicode, UTF-8, and input limits", () => {
  expect(() => validateText(1 as never)).toThrow(
    new TextUtilityError("invalid_input"),
  );
  expect(() => validateText("\ud800")).toThrow("invalid_input");
  expect(() => validateText("a".repeat(MAX_UTILITY_INPUT + 1))).toThrow(
    "too_large",
  );
});

it("flushes text builder chunks and enforces output bytes", () => {
  const builder = textBuilder();
  builder.append("a".repeat(65_536));
  builder.append("b");
  expect(builder.finish()).toHaveLength(65_537);
  const oversized = textBuilder();
  expect(() => oversized.append("x".repeat(MAX_UTILITY_OUTPUT + 1))).toThrow(
    "too_large",
  );
});
