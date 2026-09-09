import { isAbsolute, relative, resolve } from "node:path";
import { types as t, transformSync } from "@babel/core";
import { createInstrumenter } from "@vitest/istanbul-lib-instrument";
import { normalizePath, type Plugin, transformWithOxc } from "vite";

/** Use the same source coordinates before environment transforms or route splitting. */
export async function instrumentSource(
  code: string,
  filename: string,
  coverageVariable = "__coverage__",
  instrumentationId = filename,
) {
  const path = normalizePath(resolve(filename));
  const transformed = await transformWithOxc(code, path, {
    sourcemap: true,
    jsx: "preserve",
  });
  if (!transformed.map)
    throw new Error(`Missing canonical source map: ${path}`);
  // Istanbul does not count default-export call/object initialization itself.
  // Keep declarations and anonymous function/arrow/class expressions untouched:
  // introducing a binding for them changes inferred names or declaration hoisting.
  const canonical = transformSync(transformed.code, {
    filename: path,
    configFile: false,
    babelrc: false,
    sourceMaps: true,
    inputSourceMap: {
      ...transformed.map,
      file: transformed.map.file ?? path,
      version: 3,
    },
    parserOpts: { plugins: ["jsx"] },
    plugins: [
      () => ({
        visitor: {
          ExportDefaultDeclaration(exportPath) {
            const expression = exportPath.node.declaration;
            if (
              !t.isCallExpression(expression) &&
              !t.isObjectExpression(expression)
            )
              return;
            const binding =
              exportPath.scope.generateUidIdentifier("coverageDefault");
            exportPath.replaceWithMultiple([
              t.variableDeclaration("const", [
                t.variableDeclarator(binding, expression),
              ]),
              t.exportNamedDeclaration(null, [
                t.exportSpecifier(binding, t.identifier("default")),
              ]),
            ]);
          },
        },
      }),
    ],
  });
  if (canonical?.code == null || !canonical.map)
    throw new Error(`Missing canonical export transform: ${path}`);
  const instrumenter = createInstrumenter({
    parserPlugins: ["jsx"],
    esModules: true,
    produceSourceMap: true,
    autoWrap: false,
    compact: false,
    ignoreLines: true,
    coverageVariable,
    coverageGlobalScope: "globalThis",
    coverageGlobalScopeFunc: false,
  });
  const output = instrumenter.instrumentSync(
    canonical.code,
    normalizePath(resolve(instrumentationId)),
    {
      ...canonical.map,
      file: canonical.map.file ?? path,
      names: [...canonical.map.names],
      sources: canonical.map.sources.map((source) => {
        if (source === null)
          throw new Error(`Unsupported null source in canonical map: ${path}`);
        return source;
      }),
      sourcesContent: canonical.map.sourcesContent
        ? [...canonical.map.sourcesContent]
        : undefined,
      ignoreList: canonical.map.ignoreList
        ? [...canonical.map.ignoreList]
        : undefined,
      version: 3,
    },
  );
  return {
    code: output,
    map: JSON.stringify(instrumenter.lastSourceMap()),
    transformedCode: transformed.code,
    fileCoverage: instrumenter.lastFileCoverage(),
  };
}

/** Test builds opt in explicitly; production builds never enable this implicitly. */
export function coverageInstrumentation({
  enabled = false,
  root = process.cwd(),
  coverageVariable = "__coverage__",
}: {
  enabled?: boolean | (() => boolean);
  root?: string;
  coverageVariable?: string;
} = {}) {
  const projectRoot = resolve(root);
  return {
    name: "tooltab-test-coverage",
    enforce: "pre",
    transform: {
      order: "pre",
      async handler(code, id) {
        if (
          !(typeof enabled === "function" ? enabled() : enabled) ||
          id.includes("\0")
        )
          return null;
        const [filename, query = ""] = id.split("?");
        if (!isAbsolute(filename) || /(?:^|&)(?:raw|url)(?:&|$|=)/.test(query))
          return null;
        const path = normalizePath(relative(projectRoot, filename));
        const inScope =
          path === "project.inlang/routing.js" ||
          (/^src\/.*\.(?:[jt]sx?)$/.test(path) &&
            !path.startsWith("src/paraglide/") &&
            path !== "src/routeTree.gen.ts" &&
            !path.endsWith(".d.ts"));
        if (!inScope) return null;
        const { code: output, map } = await instrumentSource(
          code,
          filename,
          coverageVariable,
          query.split("&").includes("vitest-uncovered-coverage=true")
            ? id
            : filename,
        );
        return { code: output, map };
      },
    },
  } satisfies Plugin;
}
