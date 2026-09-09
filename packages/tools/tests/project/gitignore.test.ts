import { describe, expect, it } from "vitest";
import {
  generateGitignore,
  gitignoreCatalog,
  gitignoreCategories,
  popularGitignores,
  searchGitignores,
} from "../../src/project/gitignore";

describe("gitignore catalog", () => {
  it("contains the deduplicated real catalog and all categories", () => {
    expect(gitignoreCatalog).toHaveLength(295);
    expect(new Set(gitignoreCatalog.map((entry) => entry.name)).size).toBe(
      gitignoreCatalog.length,
    );
    expect(gitignoreCategories).toEqual(["language", "global", "community"]);
    for (const category of gitignoreCategories) {
      const matches = searchGitignores("", category);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every((entry) => entry.category === category)).toBe(true);
    }
    expect(popularGitignores).toEqual([
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
    ]);
    expect(gitignoreCatalog).toEqual(
      [...gitignoreCatalog].sort((left, right) =>
        left.name.localeCompare(right.name, "en"),
      ),
    );
  });

  it("searches case-insensitively after trimming and filters every category", () => {
    expect(searchGitignores()).toEqual(gitignoreCatalog);
    expect(searchGitignores("  PyThOn  ").map((entry) => entry.name)).toEqual([
      "Python",
    ]);
    expect(
      searchGitignores("node", "language").map((entry) => entry.name),
    ).toContain("Node");
    expect(
      searchGitignores("node", "global").map((entry) => entry.name),
    ).toEqual(["MonoDevelop"]);
    expect(searchGitignores("  ")).toEqual(gitignoreCatalog);
    expect(searchGitignores("zzzz-no-template")).toEqual([]);
  });

  it("enforces the query boundary and preserves valid maximum length input", () => {
    expect(searchGitignores("n".repeat(1000))).toEqual([]);
    expect(() => searchGitignores("n".repeat(1001))).toThrow("invalid_input");
  });
});

describe("gitignore generation", () => {
  it("returns empty output for no selections and rejects invalid or excessive selections", () => {
    expect(generateGitignore([])).toBe("");
    expect(() => generateGitignore(["missing"])).toThrow("invalid_template");
    expect(() =>
      generateGitignore(
        Array.from({ length: gitignoreCatalog.length + 1 }, () => "Node"),
      ),
    ).toThrow("invalid_template");
  });

  it("deduplicates repeated selections and emits selected templates in catalog order", () => {
    const selected = ["Python", "Node", "Node"] as const;
    const selectedNames = new Set<string>(selected);
    const expected = gitignoreCatalog
      .filter((entry) => selectedNames.has(entry.name))
      .map((entry) => `### ${entry.name} ###\n${entry.content}`)
      .join("\n\n");

    expect(generateGitignore(selected)).toBe(expected);
    expect(generateGitignore(["Python", "Node", "Node"])).toBe(
      generateGitignore(["Node", "Python"]),
    );
    expect(generateGitignore(selected)).toContain("### Node ###\n# Logs");
    expect(generateGitignore(selected)).toContain(
      "### Python ###\n# Byte-compiled",
    );
  });

  it("combines the complete catalog and preserves every real template content", () => {
    const output = generateGitignore(
      gitignoreCatalog.map((entry) => entry.name),
    );
    expect(output.length).toBeGreaterThan(100_000);
    for (const entry of gitignoreCatalog)
      expect(output).toContain(entry.content);
  });
});
