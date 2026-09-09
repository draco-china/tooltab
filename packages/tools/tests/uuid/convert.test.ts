import { describe, expect, it } from "vitest";
import { convertUuid, parseUuid } from "../../src/uuid/convert";

const v1 = "c1ed67f0-34bd-11f0-b3fe-02d71e841f4f";
const v6 = "1f034bdc-1ed6-67f0-b3fe-02d71e841f4f";

describe("UUID v1/v6 conversion", () => {
  it("round trips without changing sequence or node bits", () => {
    expect(convertUuid("v1-to-v6", v1)).toEqual({
      kind: "valid",
      input: v1,
      output: v6,
    });
    expect(convertUuid("v6-to-v1", v6)).toEqual({
      kind: "valid",
      input: v6,
      output: v1,
    });
  });

  it("normalizes supported wrappers and reports precise errors", () => {
    expect(convertUuid("v1-to-v6", `{URN:UUID:${v1.toUpperCase()}}`)).toEqual({
      kind: "valid",
      input: v1,
      output: v6,
    });
    expect(parseUuid("", "v1")).toEqual({ kind: "invalid", error: "empty" });
    expect(parseUuid("not-a-uuid", "v1")).toEqual({
      kind: "invalid",
      error: "format",
    });
    expect(parseUuid(v6, "v1")).toEqual({ kind: "invalid", error: "version" });
  });
});

it("accepts compact input and rejects malformed decorators and variant bits", () => {
  expect(convertUuid("v1-to-v6", v1.replaceAll("-", ""))).toEqual({
    kind: "valid",
    input: v1,
    output: v6,
  });
  expect(convertUuid("v1-to-v6", "  ")).toEqual({ kind: "empty" });
  expect(convertUuid("v6-to-v1", "invalid")).toEqual({
    kind: "invalid",
    error: "format",
  });
  expect(parseUuid(`{${v1}`, "v1")).toEqual({
    kind: "invalid",
    error: "format",
  });
  expect(convertUuid("v1-to-v6", v1.replace("-b3fe-", "-73fe-"))).toEqual({
    kind: "invalid",
    error: "variant",
  });
});
