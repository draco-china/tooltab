import catalogData from "./gitignore-catalog.json";
export const gitignoreCategories = ["language", "global", "community"] as const;
export type GitignoreCategory = (typeof gitignoreCategories)[number];
export type GitignoreTemplate = {
  name: string;
  category: GitignoreCategory;
  path: string;
  content: string;
};
const seen = new Set<string>();
export const gitignoreCatalog = (catalogData as GitignoreTemplate[])
  .filter((entry) => {
    if (seen.has(entry.name)) return false;
    seen.add(entry.name);
    return true;
  })
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
export const popularGitignores = [
  "Node",
  "Python",
  "Java",
  "Go",
  "Rust",
  "macOS",
  "Windows",
  "Linux",
  "VisualStudioCode",
  "JetBrains",
].filter((name) => seen.has(name));
export function searchGitignores(
  query = "",
  category: GitignoreCategory | "all" = "all",
) {
  if (query.length > 1000) throw Error("invalid_input");
  const search = query.trim().toLowerCase();
  return gitignoreCatalog.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      item.name.toLowerCase().includes(search),
  );
}
export function generateGitignore(selected: readonly string[]) {
  if (
    selected.length > gitignoreCatalog.length ||
    selected.some((name) => !seen.has(name))
  )
    throw Error("invalid_template");
  const names = new Set(selected);
  return gitignoreCatalog
    .filter((item) => names.has(item.name))
    .map((item) => `### ${item.name} ###\n${item.content}`)
    .join("\n\n");
}
