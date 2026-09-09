import { expect, it } from "vitest";
import {
  fromChineseAmount,
  MAX_AMOUNT_CENTS,
  NumberConversionError,
  toChineseAmount,
} from "../../src/number/chinese-amount";

const errorCode = (fn: () => unknown) => {
  try {
    fn();
    throw new Error("expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(NumberConversionError);
    return (error as NumberConversionError).code;
  }
};

it("formats strict financial amounts with exact cents and traditional glyphs", () => {
  expect(toChineseAmount("1024.50")).toEqual({
    number: "1024.5",
    uppercase: "壹仟零贰拾肆元伍角",
  });
  expect(toChineseAmount("-1024.50", true)).toEqual({
    number: "-1024.5",
    uppercase: "負壹仟零貳拾肆圓伍角",
  });
  expect(toChineseAmount("100100001.05").uppercase).toBe(
    "壹亿零壹拾万零壹元零伍分",
  );
  expect(toChineseAmount("0.01").uppercase).toBe("零元零壹分");
  expect(toChineseAmount("-0.00").uppercase).toBe("零元整");
});

it("roundtrips exact cents across zero gaps, signs, and maximum", () => {
  for (const value of [
    "0",
    "0.01",
    "0.1",
    "10",
    "101",
    "1001",
    "10001",
    "100000001",
    "100010001",
    "1000000000001",
    "999999999999999.99",
    "-999999999999999.99",
  ])
    for (const traditional of [false, true]) {
      const formatted = toChineseAmount(value, traditional);
      expect(fromChineseAmount(formatted.uppercase, traditional)).toEqual(
        formatted,
      );
    }
});

it("parses aliases, permitted jiao suffix, and exact output", () => {
  expect(fromChineseAmount("壹仟零貳拾肆圓伍角").number).toBe("1024.5");
  expect(fromChineseAmount("壹仟肆佰零玖元伍角整").number).toBe("1409.5");
  expect(fromChineseAmount("壹元").number).toBe("1");
  expect(fromChineseAmount("拾元").number).toBe("10");
  expect(fromChineseAmount("壹万元").number).toBe("10000");
  expect(fromChineseAmount("负壹元零壹分")).toEqual({
    number: "-1.01",
    uppercase: "负壹元零壹分",
  });
  expect(fromChineseAmount("貳圓整", true)).toEqual({
    number: "2",
    uppercase: "貳圓整",
  });
});

it("keeps strict decimal syntax and validation precedence", () => {
  for (const value of ["+1", " 1", "1 ", "1\n", ".5", "1.234", "1e3", "NaN"])
    expect(errorCode(() => toChineseAmount(value))).toBe("invalid_amount");
  expect(errorCode(() => toChineseAmount("1".repeat(33)))).toBe(
    "invalid_amount",
  );
  expect(errorCode(() => toChineseAmount("1000000000000000"))).toBe(
    "amount_range",
  );
  expect(MAX_AMOUNT_CENTS).toBe(99999999999999999n);
});

it("rejects malformed Chinese structure, suffixes, and overlong input", () => {
  for (const value of [
    "壹贰元",
    "壹亿亿元",
    "一元",
    "壹元伍分伍角",
    "壹元整\n",
    "元",
    "负元",
    "零零元",
    "壹元伍分整",
    "壹元零角",
    "壹元零分",
    "壹拾拾元",
    "壹零拾元",
    "佰元",
    "壹拾零元",
    "零万元",
  ])
    expect(errorCode(() => fromChineseAmount(value))).toBe("invalid_chinese");
  expect(errorCode(() => fromChineseAmount("壹".repeat(129)))).toBe(
    "invalid_chinese",
  );
  expect(errorCode(() => fromChineseAmount("壹仟兆元"))).toBe("amount_range");
});
