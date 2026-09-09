import { expect, it } from "vitest";
import {
  AnimationError,
  animationDefaults,
  validateOptions,
  type AnimationKind,
  type AnimationOptions,
} from "../../src/image/gif-contract";

const valid = (
  overrides: Partial<AnimationOptions> = {},
): AnimationOptions => ({
  ...animationDefaults,
  ...overrides,
});

function expectInvalid(kind: string, options: unknown) {
  try {
    validateOptions(kind as AnimationKind, options as AnimationOptions);
    throw new Error("expected invalid options");
  } catch (error) {
    expect(error).toBeInstanceOf(AnimationError);
    expect((error as AnimationError).code).toBe("invalid_options");
  }
}

it("accepts defaults and every supported kind and loop mode", () => {
  expect(animationDefaults).toEqual({
    scale: 100,
    speed: 1,
    loopMode: "inherit",
    loopCount: 1,
  });
  for (const kind of ["webp", "apng"] as const)
    for (const loopMode of ["inherit", "infinite", "custom"] as const)
      expect(() =>
        validateOptions(kind, valid({ loopMode, loopCount: 1 })),
      ).not.toThrow();
});

it("accepts inclusive scale and speed boundaries", () => {
  for (const kind of ["webp", "apng"] as const) {
    for (const scale of [10, 400])
      expect(() => validateOptions(kind, valid({ scale }))).not.toThrow();
    for (const speed of [0.25, 4])
      expect(() => validateOptions(kind, valid({ speed }))).not.toThrow();
  }
});

it("accepts each kind's inclusive custom loop limit", () => {
  expect(() =>
    validateOptions("webp", valid({ loopMode: "custom", loopCount: 1000 })),
  ).not.toThrow();
  expect(() =>
    validateOptions("apng", valid({ loopMode: "custom", loopCount: 999 })),
  ).not.toThrow();
});

it("rejects unsupported kinds, enums, non-integers and non-finite values", () => {
  expectInvalid("gif", valid());
  expectInvalid("webp", valid({ scale: 9 }));
  expectInvalid("webp", valid({ scale: 401 }));
  expectInvalid("webp", valid({ scale: 10.5 }));
  expectInvalid("webp", valid({ speed: 0.249 }));
  expectInvalid("webp", valid({ speed: 4.001 }));
  expectInvalid("webp", valid({ speed: Number.NaN }));
  expectInvalid("webp", valid({ speed: Number.POSITIVE_INFINITY }));
  expectInvalid("webp", valid({ loopMode: "other" as never }));
  expectInvalid("webp", valid({ loopCount: 1.5 }));
});

it("rejects zero, negative, and over-limit custom loops per kind", () => {
  for (const kind of ["webp", "apng"] as const) {
    expectInvalid(kind, valid({ loopMode: "custom", loopCount: 0 }));
    expectInvalid(kind, valid({ loopMode: "custom", loopCount: -1 }));
  }
  expectInvalid("webp", valid({ loopMode: "custom", loopCount: 1001 }));
  expectInvalid("apng", valid({ loopMode: "custom", loopCount: 1000 }));
});
