import { type ImageFormat, validateDimensions } from "./options";

function outputDimensions(width: number, height: number, scale: number) {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0) ||
    ![1, 2, 3].includes(scale)
  )
    throw new Error("invalidDimensions");
  return validateDimensions({ width: width * scale, height: height * scale });
}
export type PlaceholderOptions = {
  width: number;
  height: number;
  scale: number;
  backgroundType: "solid" | "linear" | "radial";
  background: string;
  endColor: string;
  text: string;
  textColor: string;
  format: ImageFormat | "svg";
};
export const placeholderDefaults: PlaceholderOptions = {
  width: 1200,
  height: 800,
  scale: 1,
  backgroundType: "solid",
  background: "#E9EEF5",
  endColor: "#B7CDF5",
  text: "",
  textColor: "#55657D",
  format: "png",
};
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function isXmlText(value: string) {
  for (const character of value) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const code = character.codePointAt(0)!;
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff
    )
      return false;
  }
  return true;
}

export function isPlaceholderText(value: string) {
  return value.length <= 500 && isXmlText(value);
}

export function placeholderSvg(options: PlaceholderOptions) {
  const size = outputDimensions(options.width, options.height, options.scale);
  if (
    ![options.background, options.endColor, options.textColor].every((c) =>
      /^#[\da-f]{6}$/i.test(c),
    ) ||
    !["solid", "linear", "radial"].includes(options.backgroundType) ||
    !isPlaceholderText(options.text)
  )
    throw new Error("error");
  const text = options.text || `${options.width} × ${options.height}`;
  const fontSize = Math.max(
    1,
    Math.min(
      options.height / 5,
      (options.width * 0.8) / Math.max(Array.from(text).length, 1),
    ),
  );
  const gradient =
    options.backgroundType === "linear" ? "linearGradient" : "radialGradient";
  const defs =
    options.backgroundType === "solid"
      ? ""
      : `<defs><${gradient} id="bg"><stop stop-color="${options.background}"/><stop offset="1" stop-color="${options.endColor}"/></${gradient}></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${options.width} ${options.height}">${defs}<rect width="100%" height="100%" fill="${options.backgroundType === "solid" ? options.background : "url(#bg)"}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${fontSize}" fill="${options.textColor}">${escapeXml(text)}</text></svg>`;
}
