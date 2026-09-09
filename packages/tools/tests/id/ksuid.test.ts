import { expect, it, vi } from "vitest";
import {
  EPOCH,
  encode,
  generate,
  KsuidError,
  localSeconds,
  localText,
  MAX_TIME,
  unixSeconds,
} from "../../src/id/ksuid";

it("matches the Segment vector and full 160-bit boundaries", () => {
  const payload = Uint8Array.from(
    "B5A1CD34B5F99D1154FB6853345C9735".match(/../g) ?? [],
    (byte) => parseInt(byte, 16),
  );
  expect(encode(EPOCH + 107608047, payload)).toBe(
    "0ujtsYcgvSTl8PAuAdqWYSMnLOv",
  );
  expect(encode(EPOCH, new Uint8Array(16))).toBe("0".repeat(27));
  expect(encode(MAX_TIME, new Uint8Array(16).fill(255))).toBe(
    "aWgEPTl1tmebfsQzFP4bxwgy80V",
  );
});

it("generates count limits with exact floored timestamps", () => {
  const random = vi.spyOn(crypto, "getRandomValues");
  const result = generate(100, MAX_TIME + 0.9);
  expect(random).toHaveBeenCalledOnce();
  expect(random.mock.calls[0]?.[0]?.byteLength).toBe(1600);
  expect(result).toMatchObject({ count: 100, timestamp: MAX_TIME });
  expect(new Set(result.ids).size).toBe(100);
  expect(result.ids.every((id) => /^[0-9A-Za-z]{27}$/.test(id))).toBe(true);
  random.mockRestore();

  const now = vi.spyOn(Date, "now").mockReturnValue((EPOCH + 1) * 1000);
  expect(generate(1).timestamp).toBe(EPOCH + 1);
  now.mockRestore();
});

it("validates counts, timestamps, entropy, and error codes", () => {
  for (const count of [0, 101, 1.5, NaN])
    expect(() => generate(count, EPOCH)).toThrow("count");
  for (const time of ["", EPOCH - 0.1, MAX_TIME + 1, Infinity])
    expect(() => unixSeconds(time)).toThrow("time");
  expect(unixSeconds(`${EPOCH}.99`)).toBe(EPOCH);
  expect(() => encode(EPOCH, new Uint8Array(15))).toThrow("random");
  expect(() => encode(EPOCH - 1, new Uint8Array(16))).toThrow(KsuidError);
  const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
    throw Error("unavailable");
  });
  expect(() => generate(1, EPOCH)).toThrow("random");
  random.mockRestore();
});

it("round trips local dates, rejects calendar errors, and handles milliseconds", () => {
  const text = localText(EPOCH);
  expect(localSeconds(text)).toBe(EPOCH);
  const minuteText = localText(EPOCH + 40);
  expect(localSeconds(minuteText.slice(0, 16))).toBe(EPOCH + 40);
  expect(localSeconds(`${text}.987`)).toBe(EPOCH);
  expect(localText(NaN)).toBe("");
  for (const value of [
    "2026-02-30T12:00:00",
    "2026-13-01T12:00:00",
    "2026-01-01T24:00:00",
    "x",
    "2026-01-01 12:00",
  ])
    expect(() => localSeconds(value)).toThrow("time");
});
