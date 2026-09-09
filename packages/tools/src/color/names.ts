import convert from "color-convert";
import names from "color-name";

export const COLOR_FAMILIES = [
  "all",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "brown",
  "gray",
  "white",
] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];
function family(rgb: [number, number, number]): Exclude<ColorFamily, "all"> {
  const [h, s, l] = convert.rgb.hsl.raw(rgb);
  if (l > 95) return "white";
  if (s < 10) return "gray";
  if (h >= 10 && h <= 50 && s < 60 && l < 50 && l > 10) return "brown";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 195) return "cyan";
  if (h < 255) return "blue";
  if (h < 285) return "purple";
  return "pink";
}
export const namedColors = Object.keys(names)
  .sort()
  .map((name) => {
    const rgb = names[name as keyof typeof names];
    return {
      name,
      hex: `#${rgb
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`,
      rgb: [...rgb] as [number, number, number],
      rgbLabel: `rgb(${rgb.join(", ")})`,
      category: family(rgb),
    };
  });
export function findNamedColors(query = "", category: ColorFamily = "all") {
  if (query.length > 1000 || !COLOR_FAMILIES.includes(category))
    throw new Error("Invalid color filter");
  const needle = query.trim().toLowerCase();
  const colors = namedColors.filter(
    (color) =>
      (category === "all" || color.category === category) &&
      (color.name.includes(needle) ||
        color.hex.slice(1).toLowerCase().includes(needle.replace(/^#/, ""))),
  );
  return { total: namedColors.length, count: colors.length, colors };
}
