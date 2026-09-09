import { describe, expect, it } from "vitest";
import {
  createMorseWav,
  convertMorse,
  MORSE_SAMPLE_RATE,
} from "../../src/text/morse";

describe("Morse converter", () => {
  it("converts text to Morse and back", () => {
    const encoded = convertMorse("SOS", "encode");
    expect(encoded.morse).toBe("... --- ...");
    expect(convertMorse(encoded.morse, "decode").text).toBe("SOS");
  });
});

it("writes a PCM WAV header for actual Morse samples", () => {
  const wav = createMorseWav("...");
  expect(new TextDecoder().decode(wav.bytes.slice(0, 4))).toBe("RIFF");
  expect(new TextDecoder().decode(wav.bytes.slice(8, 16))).toBe("WAVEfmt ");
  expect(new DataView(wav.bytes.buffer).getUint32(24, true)).toBe(
    MORSE_SAMPLE_RATE,
  );
  expect(wav.bytes.length).toBeGreaterThan(44);
  expect(() => convertMorse("... x", "decode")).toThrow("invalid_morse");
  expect(convertMorse("A €", "encode").unsupported).toEqual(["€"]);
});

it("handles word breaks, options, and malformed Morse", () => {
  expect(convertMorse("  A").text).toBe("A");
  expect(convertMorse("hello   world", "encode").morse).toContain(" / ");
  expect(convertMorse("...   ---", "decode").text).toBe("S O");
  expect(convertMorse("... / ---", "decode").text).toBe("S O");
  expect(convertMorse("/...", "decode").text).toBe("S");
  expect(() => convertMorse("x", "bad" as never)).toThrow("invalid_options");
  for (const value of ["", "   ", "........", "......-", "x"]) {
    expect(() => convertMorse(value, "decode")).toThrow("invalid_morse");
  }
  expect(() => convertMorse("... .", "decode")).not.toThrow();
});

it("renders actual multi-letter and multi-word WAV samples", () => {
  const wav = createMorseWav("... --- / ...");
  const view = new DataView(wav.bytes.buffer);
  expect(view.getUint32(40, true)).toBe(wav.bytes.length - 44);
  expect(view.getUint16(34, true)).toBe(16);
  expect(wav.durationSeconds).toBeGreaterThan(0);
});

it("rejects audio that exceeds the supported duration", () => {
  expect(() => createMorseWav(". ".repeat(40_000))).toThrow("audio_too_long");
});
