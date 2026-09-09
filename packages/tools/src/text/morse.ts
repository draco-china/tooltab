import { TextUtilityError, textBuilder, validateText } from "./shared";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const signals =
  ".- -... -.-. -.. . ..-. --. .... .. .--- -.- .-.. -- -. --- .--. --.- .-. ... - ..- ...- .-- -..- -.-- --.. ----- .---- ..--- ...-- ....- ..... -.... --... ---.. ----.".split(
    " ",
  );
const punctuation: Record<string, string> = {
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "'": ".----.",
  "!": "-.-.--",
  "/": "-..-.",
  "(": "-.--.",
  ")": "-.--.-",
  "&": ".-...",
  ":": "---...",
  ";": "-.-.-.",
  "=": "-...-",
  "+": ".-.-.",
  "-": "-....-",
  _: "..--.-",
  '"': ".-..-.",
  $: "...-..-",
  "@": ".--.-.",
};
export const MORSE_ALPHABET: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    [...letters].map((char, index) => [char, signals[index]!]),
  ),
  ...punctuation,
});
const reverse = new Map(
  Object.entries(MORSE_ALPHABET).map(([char, code]) => [code, char]),
);
export const MORSE_DOT_SECONDS = 0.09,
  MORSE_FREQUENCY = 700,
  MORSE_SAMPLE_RATE = 16000,
  MAX_MORSE_AUDIO_SECONDS = 3600;
function letterUnits(code: string) {
  return [...code].reduce(
    (total, signal) => total + (signal === "." ? 1 : 3),
    code.length - 1,
  );
}
export function convertMorse(
  input: string,
  mode: "encode" | "decode" = "encode",
) {
  validateText(input);
  if (mode !== "encode" && mode !== "decode")
    throw new TextUtilityError("invalid_options");
  const text = textBuilder(),
    morse = textBuilder(),
    unsupported = new Set<string>();
  let units = 0,
    hasLetter = false,
    breakWord = false;
  function appendLetter(char: string, code: string) {
    if (hasLetter) {
      text.append(breakWord ? " " : "");
      morse.append(breakWord ? " / " : " ");
      units += breakWord ? 7 : 3;
    }
    text.append(char);
    morse.append(code);
    units += letterUnits(code);
    hasLetter = true;
    breakWord = false;
  }
  if (mode === "encode") {
    for (const char of input.toUpperCase()) {
      if (/\s/u.test(char)) {
        if (hasLetter) breakWord = true;
        continue;
      }
      const code = MORSE_ALPHABET[char];
      if (!code) {
        unsupported.add(char);
        continue;
      }
      appendLetter(char, code);
    }
  } else {
    let token = "",
      spaces = 0;
    function flush() {
      if (!token) return;
      const char = reverse.get(token);
      if (!char) throw new TextUtilityError("invalid_morse");
      appendLetter(char, token);
      token = "";
    }
    for (const char of input) {
      if (char === "." || char === "-") {
        if (spaces) {
          flush();
          if (spaces >= 3 && hasLetter) breakWord = true;
          spaces = 0;
        }
        token += char;
        if (token.length > 7) throw new TextUtilityError("invalid_morse");
      } else if (char === "/") {
        flush();
        if (hasLetter) breakWord = true;
        spaces = 0;
      } else if (/\s/u.test(char)) {
        spaces++;
      } else throw new TextUtilityError("invalid_morse");
    }
    flush();
    if (!hasLetter) throw new TextUtilityError("invalid_morse");
  }
  const durationSeconds = units * MORSE_DOT_SECONDS;
  return {
    kind: "morse" as const,
    mode,
    text: text.finish(),
    morse: morse.finish(),
    unsupported: [...unsupported],
    units,
    durationSeconds,
    audioAvailable: units > 0 && durationSeconds <= MAX_MORSE_AUDIO_SECONDS,
  };
}
export function createMorseWav(input: string) {
  const result = convertMorse(input, "decode");
  if (!result.audioAvailable) throw new TextUtilityError("audio_too_long");
  const dotSamples = Math.round(MORSE_DOT_SECONDS * MORSE_SAMPLE_RATE),
    samples = result.units * dotSamples,
    bytes = 44 + samples * 2;
  const output = new Uint8Array(bytes),
    header = new DataView(output.buffer);
  function ascii(offset: number, value: string) {
    for (let i = 0; i < value.length; i++)
      output[offset + i] = value.charCodeAt(i);
  }
  ascii(0, "RIFF");
  header.setUint32(4, bytes - 8, true);
  ascii(8, "WAVEfmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, MORSE_SAMPLE_RATE, true);
  header.setUint32(28, MORSE_SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  ascii(36, "data");
  header.setUint32(40, samples * 2, true);
  let cursor = 0;
  const words = result.morse.split(" / ");
  for (const [wordIndex, word] of words.entries()) {
    if (wordIndex) cursor += 7 * dotSamples;
    for (const [letterIndex, code] of word.split(" ").entries()) {
      if (letterIndex) cursor += 3 * dotSamples;
      for (const [signalIndex, signal] of [...code].entries()) {
        if (signalIndex) cursor += dotSamples;
        const duration = (signal === "." ? 1 : 3) * dotSamples;
        for (let sample = 0; sample < duration; sample++) {
          const envelope = Math.min(
            1,
            sample / 160,
            (duration - 1 - sample) / 160,
          );
          const value = Math.round(
            Math.sin(
              (2 * Math.PI * MORSE_FREQUENCY * sample) / MORSE_SAMPLE_RATE,
            ) *
              0.18 *
              envelope *
              32767,
          );
          header.setInt16(44 + (cursor + sample) * 2, value, true);
        }
        cursor += duration;
      }
    }
  }
  return {
    bytes: output,
    durationSeconds: result.durationSeconds,
    sampleRate: MORSE_SAMPLE_RATE,
    frequency: MORSE_FREQUENCY,
  };
}
