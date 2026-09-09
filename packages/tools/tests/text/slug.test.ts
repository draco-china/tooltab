import { expect, it } from "vitest";
import {
  DEFAULT_CASE,
  DEFAULT_SEPARATOR,
  generateSlug,
  isSlugCase,
  isSlugSeparator,
  SLUG_CASES,
  SLUG_SEPARATORS,
} from "../../src/text/slug";

it("transliterates multilingual input with each supported separator", () => {
  expect(generateSlug("Hello World!")).toBe("hello-world");
  expect(generateSlug("你好 世界", "_")).toBe("ni_hao_shi_jie");
  expect(generateSlug("Hello World", ".", "preserve")).toBe("Hello.World");
});

it("exposes stable defaults and supported option guards", () => {
  expect(DEFAULT_SEPARATOR).toBe("-");
  expect(DEFAULT_CASE).toBe("lower");
  expect(SLUG_SEPARATORS).toEqual(["-", "_", "."]);
  expect(SLUG_CASES).toEqual(["lower", "preserve"]);
  for (const separator of SLUG_SEPARATORS)
    expect(isSlugSeparator(separator)).toBe(true);
  for (const slugCase of SLUG_CASES) expect(isSlugCase(slugCase)).toBe(true);
  expect(isSlugSeparator("/")).toBe(false);
  expect(isSlugCase("upper")).toBe(false);
});

it("trims input and preserves or lowers case without imposing a limit", () => {
  expect(generateSlug("  Mixed CASE input  ", "_", "preserve")).toBe(
    "Mixed_CASE_input",
  );
  expect(generateSlug("  Mixed CASE input  ", "_", "lower")).toBe(
    "mixed_case_input",
  );
  expect(generateSlug(" ")).toBe("");
  expect(generateSlug("x".repeat(20_001))).toHaveLength(20_001);
});
