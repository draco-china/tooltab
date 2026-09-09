import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createCoverageMap } from "@vitest/istanbul-lib-coverage";

const root = resolve(import.meta.dir, "..");
const core = resolve(root, "packages/tools/src");
const identityPath = resolve(root, "coverage/run-identity.json");
async function fingerprint() {
  const files = new Set([
    "package.json",
    "bun.lock",
    "vitest.config.ts",
    "tsconfig.base.json",
    "packages/tools/package.json",
    "packages/tools/tsconfig.json",
    "scripts/verify-core-coverage.ts",
    ...new Bun.Glob("packages/tools/{src,tests}/**/*").scanSync({
      cwd: root,
      onlyFiles: true,
    }),
  ]);
  return Object.fromEntries(
    await Promise.all(
      [...files].sort().map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(resolve(root, file)))
          .digest("hex"),
      ]),
    ),
  );
}
if (process.argv.includes("--run")) {
  const before = await fingerprint();
  const startedAt = new Date().toISOString();
  for (const name of [
    "run-identity.json",
    "coverage-summary.json",
    "coverage-final.json",
  ]) {
    await rm(resolve(root, "coverage", name), { force: true });
  }
  const child = Bun.spawn(
    [
      "node",
      resolve(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "--coverage",
    ],
    { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
  );
  const testExitCode = await child.exited;
  const after = await fingerprint();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const reportHashes: Record<string, string> = {};
  for (const name of ["coverage-summary.json", "coverage-final.json"]) {
    const file = resolve(root, "coverage", name);
    try {
      reportHashes[relative(root, file)] = createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
    } catch {
      // Missing reports remain absent and cannot pass verification below.
    }
  }
  await mkdir(resolve(root, "coverage"), { recursive: true });
  await writeFile(
    identityPath,
    JSON.stringify(
      { startedAt, testExitCode, unchanged, before, after, reportHashes },
      null,
      2,
    ),
  );
  if (!unchanged)
    throw new Error(
      "Core source or configuration changed during coverage collection",
    );
  if (testExitCode !== 0) process.exit(testExitCode);
}
const identity = JSON.parse(await readFile(identityPath, "utf8"));
if (
  identity.testExitCode !== 0 ||
  identity.unchanged !== true ||
  JSON.stringify(identity.before) !== JSON.stringify(await fingerprint()) ||
  JSON.stringify(identity.before) !== JSON.stringify(identity.after)
)
  throw new Error(
    "Coverage run failed or does not match current source and configuration",
  );
for (const name of ["coverage-summary.json", "coverage-final.json"]) {
  const file = resolve(root, "coverage", name);
  const hash = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  if (identity.reportHashes?.[relative(root, file)] !== hash)
    throw new Error(`Coverage report changed after collection: ${name}`);
}
const report = JSON.parse(
  await readFile(resolve(root, "coverage/coverage-summary.json"), "utf8"),
);
const coverage = JSON.parse(
  await readFile(resolve(root, "coverage/coverage-final.json"), "utf8"),
);
// Type-only modules emit no JavaScript. Inspect emission rather than assuming
// a filename such as types.ts is non-executable; runtime declarations still count.
const transpiler = new Bun.Transpiler({ loader: "ts" });
const sourceFiles = (
  await Promise.all(
    [...new Bun.Glob("**/*.{ts,js}").scanSync({ cwd: core, absolute: true })]
      .filter((file) => !file.endsWith(".d.ts"))
      .map(async (file) =>
        transpiler.transformSync(await readFile(file, "utf8")).trim()
          ? file
          : null,
      ),
  )
)
  .filter((file): file is string => file !== null)
  .sort();
const reportedFiles = Object.keys(coverage)
  .map((file) => resolve(file))
  .sort();
if (
  !sourceFiles.length ||
  JSON.stringify(sourceFiles) !== JSON.stringify(reportedFiles)
) {
  throw new Error(
    "Core coverage source inventory is empty or differs from the report",
  );
}
const map = createCoverageMap(coverage);
for (const file of ["total", ...sourceFiles]) {
  const entry = report[file];
  if (!entry) throw new Error(`Missing core coverage summary: ${file}`);
  const measured = (
    file === "total"
      ? map.getCoverageSummary()
      : map.fileCoverageFor(file).toSummary()
  ).toJSON();
  for (const metric of [
    "lines",
    "statements",
    "functions",
    "branches",
  ] as const) {
    const value = entry[metric];
    const actual = measured[metric];
    if (
      !value ||
      (["total", "covered", "skipped", "pct"] as const).some(
        (key) => value[key] !== actual[key],
      )
    )
      throw new Error(
        `Core coverage summary differs from raw data: ${file} ${metric}`,
      );
    if (!value || value.covered !== value.total || value.pct !== 100) {
      throw new Error(`Core coverage below 100%: ${file} ${metric}`);
    }
  }
}
console.log(
  `Core coverage inventory verified: ${sourceFiles.length} files, all four metrics 100%`,
);
