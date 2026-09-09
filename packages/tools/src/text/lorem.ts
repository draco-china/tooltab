import { TextUtilityError } from "./shared";
export const LOREM_LOCALES = [
  "en",
  "ja",
  "ko",
  "de",
  "fr",
  "ru",
  "pt_BR",
  "ar",
  "tr",
  "nl",
  "pl",
  "vi",
  "he",
] as const;
export type LoremLocale = (typeof LOREM_LOCALES)[number];
export const LATIN_LOCALES = new Set<LoremLocale>([
  "en",
  "de",
  "fr",
  "pt_BR",
  "tr",
  "nl",
  "pl",
]);
const loaders = {
  en: () => import("@faker-js/faker/locale/en"),
  ja: () => import("@faker-js/faker/locale/ja"),
  ko: () => import("@faker-js/faker/locale/ko"),
  de: () => import("@faker-js/faker/locale/de"),
  fr: () => import("@faker-js/faker/locale/fr"),
  ru: () => import("@faker-js/faker/locale/ru"),
  pt_BR: () => import("@faker-js/faker/locale/pt_BR"),
  ar: () => import("@faker-js/faker/locale/ar"),
  tr: () => import("@faker-js/faker/locale/tr"),
  nl: () => import("@faker-js/faker/locale/nl"),
  pl: () => import("@faker-js/faker/locale/pl"),
  vi: () => import("@faker-js/faker/locale/vi"),
  he: () => import("@faker-js/faker/locale/he"),
};
export type LoremOptions = {
  mode?: "words" | "sentences" | "paragraphs";
  count?: number;
  locale?: LoremLocale;
  seed?: number;
};
export async function generateLorem(options: LoremOptions = {}) {
  const mode = options.mode ?? "paragraphs",
    count = options.count ?? 1,
    locale = options.locale ?? "en";
  if (
    !["words", "sentences", "paragraphs"].includes(mode) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !Object.hasOwn(loaders, locale)
  )
    throw new TextUtilityError("invalid_options");
  let seed = options.seed;
  if (
    seed !== undefined &&
    (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
  )
    throw new TextUtilityError("invalid_options");
  if (seed === undefined) {
    if (!globalThis.crypto?.getRandomValues)
      throw new TextUtilityError("unsupported");
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!;
  }
  const { faker } = await loaders[locale]();
  faker.seed(seed);
  const output =
    mode === "words"
      ? faker.lorem.words(count)
      : mode === "sentences"
        ? faker.lorem.sentences(count)
        : faker.lorem.paragraphs(count, "\n\n");
  return {
    kind: "lorem" as const,
    mode,
    count,
    locale,
    seed,
    latin: LATIN_LOCALES.has(locale),
    output,
  };
}
