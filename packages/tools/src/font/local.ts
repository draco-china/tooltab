export type RawLocalFont = Readonly<{
  family?: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}>;

export type LocalFont = Readonly<{
  id: string;
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  displayFamily: string;
  displayName: string;
  displayStyle: string;
  searchKey: string;
}>;

export type LocalFontSort = "family" | "name" | "style";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function normalizeLocalFonts(fonts: readonly RawLocalFont[]) {
  return fonts.map((font, index): LocalFont => {
    const family = text(font.family);
    const fullName = text(font.fullName);
    const postscriptName = text(font.postscriptName);
    const style = text(font.style);
    const displayName = fullName || family || postscriptName || "--";
    const displayFamily = family || fullName || postscriptName || "--";
    const displayStyle = style || "--";
    const fallback = [fullName, family, style].filter(Boolean).join("|");
    const id =
      postscriptName || (fallback ? `${fallback}-${index}` : `font-${index}`);
    return {
      id,
      family,
      fullName,
      postscriptName,
      style,
      displayFamily,
      displayName,
      displayStyle,
      searchKey:
        `${displayFamily} ${displayName} ${postscriptName}`.toLowerCase(),
    };
  });
}

export function isItalicStyle(style: string) {
  return /italic|oblique/i.test(style);
}

export function inferFontWeight(style: string) {
  const value = style.toLowerCase();
  const numeric = value.match(/(^|\D)([1-9]00)(\D|$)/)?.[2];
  if (numeric) return Number(numeric);
  if (/thin|hairline/.test(value)) return 100;
  if (/extra[-\s]?light|ultra[-\s]?light/.test(value)) return 200;
  if (/\blight\b/.test(value)) return 300;
  if (/\bbook\b/.test(value)) return 350;
  if (/\b(regular|normal|roman)\b/.test(value)) return 400;
  if (/\bmedium\b/.test(value)) return 500;
  if (/semi[-\s]?bold|demi[-\s]?bold/.test(value)) return 600;
  if (/extra[-\s]?bold|ultra[-\s]?bold/.test(value)) return 800;
  if (/extra[-\s]?black|ultra[-\s]?black/.test(value)) return 950;
  if (/black|heavy/.test(value)) return 900;
  if (/\bbold\b/.test(value)) return 700;
  return undefined;
}

export function fontCss(font: LocalFont | undefined) {
  if (!font) return "";
  const family = font.family || font.fullName || font.postscriptName;
  if (!family) return "";
  const escaped = family.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const lines = [`font-family: "${escaped}";`];
  if (isItalicStyle(font.style)) lines.push("font-style: italic;");
  const weight = inferFontWeight(font.style);
  if (weight && weight !== 400) lines.push(`font-weight: ${weight};`);
  return lines.join("\n");
}

export function filterLocalFonts(
  fonts: readonly LocalFont[],
  query: string,
  style: "all" | "regular" | "italic",
  sortBy: LocalFontSort = "family",
) {
  const needle = query.trim().toLowerCase();
  return fonts
    .filter(
      (font) =>
        (!needle || font.searchKey.includes(needle)) &&
        (style === "all" || (style === "italic") === isItalicStyle(font.style)),
    )
    .sort((a, b) => {
      const key =
        sortBy === "name"
          ? "displayName"
          : sortBy === "style"
            ? "displayStyle"
            : "displayFamily";
      return a[key].localeCompare(b[key]);
    });
}

export function groupLocalFonts(
  fonts: readonly LocalFont[],
  byFamily: boolean,
) {
  if (!byFamily)
    return fonts.length ? [{ id: "all-fonts", label: "", items: fonts }] : [];
  const groups = new Map<string, LocalFont[]>();
  for (const font of fonts) {
    const items = groups.get(font.displayFamily) ?? [];
    items.push(font);
    groups.set(font.displayFamily, items);
  }
  return [...groups.entries()].map(([label, items]) => ({
    id: label,
    label,
    items,
  }));
}
