import { expect, it } from "vitest";
import {
  convertIntegerPart,
  convertNumberToUppercase,
  convertUppercaseToNumber,
  DIGITS_SIMPLIFIED,
  formatFractionPart,
  formatNumberString,
  normalizeUppercaseInput,
  parseChineseIntegerPart,
  parseFractionPart,
  parseNumberInput,
  parseUppercaseInput,
} from "../../src/number/chinese-uppercase";

it("parses numeric input, separators, signs, shorthand decimals, and bounds", () => {
  expect(parseNumberInput("  ").isEmpty).toBe(true);
  expect(parseNumberInput("001,234.50")).toMatchObject({
    isValid: true,
    normalized: "1234.50",
    integer: "1234",
    fraction: "50",
  });
  expect(parseNumberInput(".5")).toMatchObject({
    isValid: true,
    normalized: "0.5",
    integer: "0",
    fraction: "50",
  });
  expect(parseNumberInput("-12")).toMatchObject({
    isValid: true,
    isNegative: true,
  });
  expect(parseNumberInput("+").error).toBe("invalidFormat");
  expect(parseNumberInput(".").error).toBe("invalidFormat");
  expect(parseNumberInput("12.3.4").error).toBe("invalidFormat");
  expect(parseNumberInput("1.234").error).toBe("tooManyDecimals");
  expect(parseNumberInput("1000000000000000").error).toBe("outOfRange");
});

it("converts simplified and traditional numeric amounts", () => {
  expect(convertNumberToUppercase("0", "simplified")).toMatchObject({
    isValid: true,
    value: "零元整",
  });
  expect(convertNumberToUppercase("12", "simplified").value).toBe("壹拾贰元整");
  expect(convertNumberToUppercase("12.03", "simplified").value).toBe(
    "壹拾贰元零叁分",
  );
  expect(convertNumberToUppercase("12.30", "simplified").value).toBe(
    "壹拾贰元叁角",
  );
  expect(convertNumberToUppercase("100010001", "simplified").value).toBe(
    "壹亿零壹万零壹元整",
  );
  expect(convertNumberToUppercase("100000001", "simplified").value).toBe(
    "壹亿零壹元整",
  );
  expect(convertNumberToUppercase("1010", "simplified").value).toBe(
    "壹仟零壹拾元整",
  );
  expect(convertNumberToUppercase("-1200.5", "simplified").value).toBe(
    "负壹仟贰佰元伍角",
  );
  expect(convertNumberToUppercase("12", "traditional").value).toBe(
    "壹拾貳圓整",
  );
  expect(convertNumberToUppercase("-0", "simplified").value).toBe("零元整");
  expect(convertNumberToUppercase("  ", "simplified")).toMatchObject({
    isEmpty: true,
    isValid: false,
  });
  expect(convertNumberToUppercase("12.3.4", "simplified").error).toBe(
    "invalidFormat",
  );
});

it("normalizes and parses uppercase integer and fraction forms", () => {
  expect(normalizeUppercaseInput(" RMB 兩X圆 ")).toBe("两X元");
  expect(parseUppercaseInput("壹仟零壹元整")).toMatchObject({
    isValid: true,
    value: "1001",
  });
  expect(parseUppercaseInput("壹拾貳圓伍角")).toMatchObject({
    isValid: true,
    value: "12.5",
  });
  expect(parseUppercaseInput("伍分")).toMatchObject({
    isValid: true,
    value: "0.05",
  });
  expect(parseUppercaseInput("壹元叁角伍分")).toMatchObject({
    isValid: true,
    value: "1.35",
  });
  expect(parseUppercaseInput("人民币壹元整")).toMatchObject({
    isValid: true,
    value: "1",
  });
  expect(parseUppercaseInput("负壹元整")).toMatchObject({
    isValid: true,
    value: "-1",
    isNegative: true,
  });
  expect(parseUppercaseInput("壹拾")).toMatchObject({
    isValid: true,
    value: "10",
  });
  expect(parseUppercaseInput("壹元")).toMatchObject({
    isValid: true,
    value: "1",
  });
  expect(parseUppercaseInput("负").error).toBe("invalidFormat");
  expect(parseUppercaseInput("")).toMatchObject({
    isEmpty: true,
    isValid: false,
  });
});

it("rejects malformed uppercase syntax and range", () => {
  expect(parseUppercaseInput("ABC").error).toBe("invalidCharacters");
  for (const input of [
    "壹拾拾元",
    "壹元角伍分",
    "壹元元",
    "壹角元",
    "壹贰元",
    "零拾元",
    "壹亿兆元",
    "万元",
    "壹元整伍分",
  ]) {
    expect(parseUppercaseInput(input).error).toBe("invalidFormat");
  }
  expect(parseUppercaseInput("壹仟兆元整").error).toBe("outOfRange");
});

it("converts uppercase results and handles malformed or empty values", () => {
  expect(convertUppercaseToNumber("零伍分")).toMatchObject({
    isValid: true,
    value: "0.05",
  });
  expect(convertUppercaseToNumber("")).toMatchObject({
    isEmpty: true,
    isValid: false,
  });
  expect(convertUppercaseToNumber("壹元角").error).toBe("invalidFormat");
});

it("covers conversion helper boundaries", () => {
  expect(convertIntegerPart("", DIGITS_SIMPLIFIED, [])).toBe("零");
  expect(convertIntegerPart("0000", DIGITS_SIMPLIFIED, [""])).toBe("零");
  expect(convertIntegerPart("1", DIGITS_SIMPLIFIED, [])).toBe("壹");
  expect(convertIntegerPart("", [], [])).toBe("");
  expect(() => convertIntegerPart("1", [], [])).toThrow(RangeError);
  expect(formatFractionPart("05", DIGITS_SIMPLIFIED, "壹")).toBe("零伍分");
  expect(formatFractionPart("05", DIGITS_SIMPLIFIED, "零")).toBe("伍分");
  expect(formatFractionPart("00", DIGITS_SIMPLIFIED, "壹")).toBe("整");
  expect(parseChineseIntegerPart("")).toBe(0n);
  expect(parseChineseIntegerPart("拾")).toBe(10n);
  expect(parseChineseIntegerPart("壹拾佰")).toBeNull();
  expect(parseChineseIntegerPart("零拾")).toBeNull();
  expect(parseChineseIntegerPart("壹亿兆")).toBeNull();
  expect(parseChineseIntegerPart("万")).toBeNull();
  expect(parseChineseIntegerPart("A")).toBeNull();
  expect(parseFractionPart("零伍分")).toEqual({ jiao: 0, fen: 5 });
  expect(parseFractionPart("整伍分")).toBeNull();
  expect(parseFractionPart("壹角伍分")).toEqual({ jiao: 1, fen: 5 });
  expect(parseFractionPart("壹角")).toEqual({ jiao: 1, fen: 0 });
  expect(parseFractionPart("")).toEqual({ jiao: 0, fen: 0 });
  expect(formatNumberString(12n, 1, 0)).toBe("12.1");
  expect(formatNumberString(12n, 0, 0)).toBe("12");
});
