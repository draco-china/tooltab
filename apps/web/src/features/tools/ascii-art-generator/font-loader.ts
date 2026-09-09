import figlet from "figlet";
import { AsciiError } from "@workspace/tools/text/ascii";

const modules = import.meta.glob<{ default: string }>(
  "/node_modules/figlet/importable-fonts/*.js",
);
export const asciiFontNames = Object.keys(modules)
  .map((path) => path.match(/\/([^/]+)\.js$/)?.[1])
  .filter((name): name is string => Boolean(name))
  .sort((a, b) => a.localeCompare(b));
const loaded = new Set<string>();

export async function loadAsciiFont(name: string) {
  if (loaded.has(name)) return;
  const key = Object.keys(modules).find((path) => path.endsWith(`/${name}.js`));
  if (!key) throw new AsciiError("font_not_found");
  const module = await modules[key]();
  figlet.parseFont(name, module.default);
  loaded.add(name);
}
