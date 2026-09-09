export class NumberConversionError extends Error {
  constructor(
    public readonly code: "invalid_amount" | "amount_range" | "invalid_chinese",
  ) {
    super(code);
  }
}

const digits = "零壹贰叁肆伍陆柒捌玖";
const small = ["", "拾", "佰", "仟"];
const large = ["", "万", "亿", "兆"];
export const MAX_AMOUNT_CENTS = 99999999999999999n;
function parseAmount(input: string): bigint {
  if (input.trim() !== input) throw new NumberConversionError("invalid_amount");
  if (input.length > 32 || !/^-?\d+(?:\.\d{1,2})?$/.test(input))
    throw new NumberConversionError("invalid_amount");
  const negative = input.startsWith("-");
  const [integer, fraction = ""] = (negative ? input.slice(1) : input).split(
    ".",
  ) as [string, string?];
  const value = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (value > MAX_AMOUNT_CENTS) throw new NumberConversionError("amount_range");
  return negative ? -value : value;
}
function groupText(value: number) {
  let result = "",
    pendingZero = false;
  for (let i = 3; i >= 0; i--) {
    const digit = Math.floor(value / 10 ** i) % 10;
    if (digit) {
      if (pendingZero && result) result += "零";
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      result += digits[digit]! + small[i]!;
      pendingZero = false;
    } else if (result) pendingZero = true;
  }
  return result;
}
export function toChineseAmount(
  input: string,
  traditional = false,
): { number: string; uppercase: string } {
  const signed = parseAmount(input);
  const cents = signed < 0n ? -signed : signed;
  let integer = cents / 100n;
  const groups: number[] = [];
  while (integer) {
    groups.push(Number(integer % 10000n));
    integer /= 10000n;
  }
  let text = "",
    zero = false;
  for (let i = groups.length - 1; i >= 0; i--) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const group = groups[i]!;
    if (!group) {
      zero = true;
      continue;
    }
    if (text && (zero || group < 1000)) text += "零";
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    text += groupText(group) + large[i]!;
    zero = false;
  }
  text = `${text || "零"}元`;
  const jiao = Number((cents / 10n) % 10n),
    fen = Number(cents % 10n);
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  if (jiao) text += `${digits[jiao]!}角`;
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  if (fen) text += `${(jiao ? "" : "零") + digits[fen]!}分`;
  if (!jiao && !fen) text += "整";
  if (signed < 0n) text = `负${text}`;
  if (traditional) {
    const map: Record<string, string> = {
      贰: "貳",
      叁: "參",
      陆: "陸",
      万: "萬",
      亿: "億",
      元: "圓",
      负: "負",
    };
    text = Array.from(text, (c) => map[c] ?? c).join("");
  }
  const number =
    (signed < 0n ? "-" : "") +
    (cents / 100n).toString() +
    (cents % 100n
      ? `.${(cents % 100n).toString().padStart(2, "0").replace(/0$/, "")}`
      : "");
  return { number, uppercase: text };
}
function readGroup(input: string): bigint {
  if (input === "零") return 0n;
  let value = 0n,
    pending: number | null = null,
    lastUnit = 10000,
    zero = false;
  for (const char of input) {
    const d = digits.indexOf(char);
    if (d === 0) {
      if (zero || pending !== null)
        throw new NumberConversionError("invalid_chinese");
      zero = true;
      continue;
    }
    if (d > 0) {
      if (pending !== null) throw new NumberConversionError("invalid_chinese");
      pending = d;
      zero = false;
      continue;
    }
    const unit = small.indexOf(char);
    if (unit < 1 || 10 ** unit >= lastUnit || zero)
      throw new NumberConversionError("invalid_chinese");
    if (pending === null && !(value === 0n && unit === 1))
      throw new NumberConversionError("invalid_chinese");
    value += BigInt((pending ?? 1) * 10 ** unit);
    lastUnit = 10 ** unit;
    pending = null;
  }
  if (zero) throw new NumberConversionError("invalid_chinese");
  return value + BigInt(pending ?? 0);
}
export function fromChineseAmount(
  input: string,
  traditional = false,
): { number: string; uppercase: string } {
  if (input.length > 128) throw new NumberConversionError("invalid_chinese");
  const aliases: Record<string, string> = {
    貳: "贰",
    參: "叁",
    陸: "陆",
    萬: "万",
    億: "亿",
    圓: "元",
    圆: "元",
    負: "负",
    正: "整",
    〇: "零",
    兩: "贰",
    两: "贰",
  };
  const normalized = Array.from(input, (c) => aliases[c] ?? c).join("");
  const match =
    /^(负)?([零壹贰叁肆伍陆柒捌玖拾佰仟万亿兆]+)元(整|[零壹贰叁肆伍陆柒捌玖角分]+整?)?$/.exec(
      normalized,
    );
  if (!match || match[0] !== normalized)
    throw new NumberConversionError("invalid_chinese");
  let integer = 0n,
    start = 0,
    lastPower = 4;
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const whole = match[2]!;
  for (let i = 0; i < whole.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const power = large.indexOf(whole[i]!);
    if (power > 0) {
      if (power >= lastPower)
        throw new NumberConversionError("invalid_chinese");
      let segment = whole.slice(start, i);
      if (start > 0 && segment.startsWith("零")) segment = segment.slice(1);
      const group = readGroup(segment);
      if (group === 0n) throw new NumberConversionError("invalid_chinese");
      integer += group * 10000n ** BigInt(power);
      lastPower = power;
      start = i + 1;
    }
  }
  if (start < whole.length) {
    let segment = whole.slice(start);
    if (start > 0 && segment.startsWith("零")) segment = segment.slice(1);
    integer += readGroup(segment);
  }
  let cents = 0n;
  const fraction = (match[3] ?? "").replace(/角整$/, "角");
  if (fraction && fraction !== "整") {
    const f =
      /^(?:零?([壹贰叁肆伍陆柒捌玖])角)?(?:零?([壹贰叁肆伍陆柒捌玖])分)?$/.exec(
        fraction,
      );
    if (!f || (!f[1] && !f[2]))
      throw new NumberConversionError("invalid_chinese");
    cents = BigInt(
      (f[1] ? digits.indexOf(f[1]) * 10 : 0) +
        (f[2] ? digits.indexOf(f[2]) : 0),
    );
  }
  const total = integer * 100n + cents;
  if (total > MAX_AMOUNT_CENTS) throw new NumberConversionError("amount_range");
  return toChineseAmount(
    `${match[1] ? "-" : ""}${integer}.${cents.toString().padStart(2, "0")}`,
    traditional,
  );
}
