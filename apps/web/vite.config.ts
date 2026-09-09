import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { build as rolldownBuild, type PluginContext } from "rolldown";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  localeRouteStrategies,
  localeStrategy,
  localeTrailingSlash,
  localeUrlPatterns,
} from "./project.inlang/routing.js";
import settings from "./project.inlang/settings.json" with { type: "json" };
import toolIds from "./src/features/tools/catalog/ids.json" with {
  type: "json",
};
import { captureProductionManifest } from "./scripts/build/build-manifest.ts";
import { coverageInstrumentation } from "./scripts/build/instrument.ts";

const coverageEnabled = process.env.TOOLTAB_COVERAGE === "1";
const outputRoot = coverageEnabled ? ".output-coverage" : ".output";
const coveragePlugin = () =>
  coverageInstrumentation({ enabled: coverageEnabled });

// Keep the Service Worker independent from JavaScript parsing. Rollup already
// knows each emitted chunk's static imports, so emit that graph for the shell
// cache to traverse from the resources present in the rendered home page.
function appShellImportGraph() {
  return {
    name: "tooltab-app-shell-import-graph",
    apply: "build" as const,
    generateBundle(
      this: PluginContext,
      _: unknown,
      bundle: Record<
        string,
        { type: string; fileName: string; imports?: string[] }
      >,
    ) {
      const graph = Object.fromEntries(
        Object.values(bundle).flatMap((entry) => {
          if (
            entry.type !== "chunk" ||
            !entry.fileName.endsWith(".js") ||
            !entry.imports?.length
          )
            return [];
          return [
            [`/${entry.fileName}`, entry.imports.map((path) => `/${path}`)],
          ];
        }),
      );
      this.emitFile({
        type: "asset",
        fileName: "app-shell-imports.json",
        source: JSON.stringify(graph),
      });
    },
  };
}

const prerenderPages = settings.locales.flatMap((locale) =>
  [
    "",
    "/tools",
    "/api",
    "/mcp",
    "/privacy",
    "/terms",
    ...toolIds.map((id) => `/tools/${id}`),
  ].map((path) => ({
    path: locale === settings.baseLocale ? path || "/" : `/${locale}${path}`,
  })),
);
const prerenderPathnames = new Set(prerenderPages.map(({ path }) => path));

const serverWorkerNames = [
  "archive-viewer-worker",
  "barcode-worker",
  "cidr-tools-worker",
  "curl-worker",
  "data-uri-worker",
  "docker-parser-worker",
  "gif-animation-worker",
  "image-formats-worker",
  "image-optimizers-worker",
  "list-slug-worker",
  "pdf-finishing-worker",
  "pdf-reading-worker",
  "project-config-worker",
] as const;

function serverWorkerEntries() {
  let built = false;
  return {
    name: "tooltab-server-worker-entries",
    apply: "build" as const,
    async closeBundle() {
      if (built) return;
      built = true;
      const outdir = `${outputRoot}/server/workers`;
      await mkdir(outdir, { recursive: true });
      await rolldownBuild({
        plugins: [
          coverageInstrumentation({
            enabled: coverageEnabled,
          }),
          {
            name: "openapi-service-ts5-ast",
            resolveId(source, importer) {
              if (
                source === "typescript" &&
                importer?.includes("/node_modules/openapi-typescript/")
              ) {
                return fileURLToPath(
                  new URL(
                    "./node_modules/typescript-legacy/lib/typescript.js",
                    import.meta.url,
                  ),
                );
              }
            },
          },
          {
            name: "curl-service-wasm-parser",
            resolveId(source, importer) {
              if (
                source === "curlconverter/dist/src/shell/Parser.js" ||
                (source === "./Parser.js" &&
                  importer?.endsWith(
                    "/curlconverter/dist/src/shell/tokenizer.js",
                  ))
              ) {
                return fileURLToPath(
                  new URL(
                    "./src/features/api/runtime/curl-wasm-parser.ts",
                    import.meta.url,
                  ),
                );
              }
            },
          },
        ],
        input: Object.fromEntries([
          ...serverWorkerNames.map((name) => [
            name,
            `src/features/api/runtime/${name}.ts`,
          ]),
          [
            "base-encoding-worker",
            "src/features/tools/base-encoding/worker.ts",
          ],
          [
            "certificate-tools-worker",
            "src/features/tools/certificate-tools/worker.ts",
          ],
          [
            "code-screenshot-server-worker",
            "src/features/tools/code-screenshot-generator/server-worker.ts",
          ],
          [
            "gradient-raster-worker",
            "src/features/tools/css-generators/raster-worker.ts",
          ],
          ["csv-json-worker", "src/features/tools/csv-json/worker.ts"],
          [
            "ical-event-generator-worker",
            "src/features/tools/ical-event-generator/worker.ts",
          ],
          ["jose-tools-worker", "src/features/tools/jose-tools/worker.ts"],
          ["kdf-tools-worker", "src/features/tools/kdf-tools/worker.ts"],
          [
            "password-tools-worker",
            "src/features/tools/password-tools/worker.ts",
          ],
          ["pdf-editing-worker", "src/features/tools/pdf-editing/worker.ts"],
          [
            "pgp-key-generator-worker",
            "src/features/tools/pgp-key-generator/worker.ts",
          ],
          ["qr-tools-worker", "src/features/tools/qr-tools/worker.ts"],
          [
            "seo-generators-worker",
            "src/features/tools/seo-generators/worker.ts",
          ],
          ["ssh-tools-worker", "src/features/tools/ssh-tools/worker.ts"],
          [
            "text-analysis-worker",
            "src/features/tools/text-analysis/worker.ts",
          ],
          [
            "text-utilities-worker",
            "src/features/tools/text-utilities/worker.ts",
          ],
          ["crc-checksum-worker", "src/features/tools/crc-checksum/worker.ts"],
          [
            "legacy-hashes-worker",
            "src/features/tools/legacy-hashes/worker.ts",
          ],
          [
            "structured-formats-worker",
            "src/features/tools/structured-formats/worker.ts",
          ],
          ["xml-json-worker", "src/features/tools/xml-json/worker.ts"],
          ["json-query-worker", "src/features/tools/json-query/worker.ts"],
          ["aes-worker", "src/features/tools/aes-tools/worker.ts"],
          ["bcrypt-worker", "src/features/tools/bcrypt/worker.ts"],
          ["argon2-worker", "src/features/tools/argon2/worker.ts"],
          [
            "code-formatters-worker",
            "src/features/tools/code-formatters/worker.ts",
          ],
          [
            "json-schema-worker",
            "src/features/tools/json-schema-tools/worker.ts",
          ],
          [
            "image-metadata-worker",
            "src/features/tools/image-metadata/worker.ts",
          ],
          [
            "markdown-tools-worker",
            "src/features/tools/markdown-tools/worker.ts",
          ],
        ]),
        // Nitro traces these runtime packages into .output. Leaving them
        // external also preserves native bindings and package-relative WASM.
        external: [
          ...builtinModules,
          /^node:/,
          /^(?:figlet|zod)(?:\/|$)/,
          /^@jsquash\/(?:avif|oxipng)(?:\/|$)/,
          /^@napi-rs\/canvas(?:\/|$)/,
          /^zxing-wasm(?:\/|$)/,
          /^@libwebp-wasm\/img2webp(?:\/|$)/,
          /^pdfjs-dist(?:\/|$)/,
          /^@neslinesli93\/qpdf-wasm(?:\/|$)/,
        ],
        output: {
          dir: outdir,
          entryFileNames: "[name].js",
          format: "esm",
        },
      });
    },
  };
}

// Nitro copies public files after the client PWA hook. Read the versioned
// PDF resources from source so their cache allowlist cannot miss that phase.
function pdfManifestEntries(
  path = "pdfjs-6.3.289",
): { url: string; revision: string }[] {
  const directory = new URL(`./public/${path}/`, import.meta.url);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = `${path}/${entry.name}`;
    if (entry.isDirectory()) return pdfManifestEntries(url);
    if (!/\.(bcmap|pfb|ttf|icc|wasm|js)$/.test(entry.name)) return [];
    const revision = createHash("sha256")
      .update(readFileSync(new URL(entry.name, directory)))
      .digest("hex");
    return [{ url, revision }];
  });
}

// The pinned single-thread AVIF codec is indivisible and slightly exceeds the
// general asset limit. Admit only this exact codec, without widening that limit.
function avifManifestEntries(): {
  url: string;
  revision: string;
  size: number;
}[] {
  const directory = new URL("./.output/public/assets/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => /^avif_enc-[\w-]+\.wasm$/.test(name))
    .map((name) => {
      const bytes = readFileSync(new URL(name, directory));
      const revision = createHash("sha256").update(bytes).digest("hex");
      if (
        revision !==
        "d9f2a95164362af48558d176e619becfd49dd97b50b86c679b47100860522b3d"
      ) {
        throw new Error("Review the AVIF codec revision before caching it");
      }
      return { url: `assets/${name}`, revision, size: bytes.length };
    });
}

// Workers normally stay under the global cache limit. The pinned OpenAPI AST
// worker is indivisible, so admit only its reviewed bytes above that limit.
function workerManifestEntries(): {
  url: string;
  revision: string;
  size: number;
}[] {
  const directory = new URL("./.output/public/assets/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => /^worker-[\w-]+\.js$/.test(name))
    .map((name) => {
      const bytes = readFileSync(new URL(name, directory));
      const revision = createHash("sha256").update(bytes).digest("hex");
      if (
        bytes.length > 3 * 1024 * 1024 &&
        revision !==
          "4237008d456ccc1313629f53191f81389d9318be9ec5ccf0034d03a75b14763c"
      )
        throw new Error(
          "Review the oversized Worker revision before caching it",
        );
      return { url: `assets/${name}`, revision, size: bytes.length };
    });
}
// Only the OpenAPI generator's AST imports require the legacy JavaScript compiler.
function openapiCompilerAlias() {
  return {
    name: "openapi-local-ts5-ast",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (id.includes("/node_modules/openapi-typescript/dist/lib/utils.mjs"))
        return `const process = {env:{}};\n${code}`;
    },
    resolveId(source: string, importer?: string) {
      if (
        source === "node:perf_hooks" &&
        importer?.includes("/node_modules/openapi-typescript/")
      )
        return fileURLToPath(
          new URL(
            "./src/features/tools/openapi-to-typescript-converter/performance-browser.ts",
            import.meta.url,
          ),
        );
      if (
        source === "./utils" &&
        importer?.endsWith("/@redocly/openapi-core/lib/ref-utils.js")
      )
        return fileURLToPath(
          new URL(
            "./src/features/tools/openapi-to-typescript-converter/ref-utils-browser.ts",
            import.meta.url,
          ),
        );
      if (
        source === "typescript" &&
        importer?.includes("/node_modules/openapi-typescript/")
      )
        return fileURLToPath(
          new URL(
            "./src/features/tools/openapi-to-typescript-converter/typescript-browser.ts",
            import.meta.url,
          ),
        );
    },
  };
}
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)(?:[\\/]|$)/,
              priority: 30,
            },
          ],
        },
      },
    },
  },
  // Dev prebundling must use the same OpenAPI-only compiler aliases as builds.
  optimizeDeps: {
    rolldownOptions: { plugins: [openapiCompilerAlias()] },
  },
  // Keep the fixed formatter plugins as separate local chunks in module Workers.
  worker: {
    format: "es",
    plugins: () => [openapiCompilerAlias(), coveragePlugin()],
  },
  resolve: { tsconfigPaths: true },
  ssr: { external: ["figlet"] },
  server: { watch: { ignored: ["**/.output/**", "**/.output-coverage/**"] } },
  plugins: [
    {
      name: "isolated-prerender-preview",
      enforce: "post",
      apply: (_config, env) =>
        Boolean(env.isPreview) && process.env.TSS_PRERENDERING === "true",
      // Nitro currently treats port 0 as absent and falls back to 3000.
      // Restore TanStack's random port after Nitro's preview configuration.
      config: () => ({ preview: { port: 0, host: "127.0.0.1", open: false } }),
    },
    coveragePlugin(),
    openapiCompilerAlias(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: localeStrategy,
      urlPatterns: localeUrlPatterns,
      routeStrategies: localeRouteStrategies,
      trailingSlash: localeTrailingSlash,
    }),
    nitro({
      // Production starts with Bun; its native adapter preserves client aborts.
      // Retain Nitro deployment overrides for explicitly selected runtimes.
      preset: process.env.NITRO_PRESET || process.env.SERVER_PRESET || "bun",
      ...(coverageEnabled
        ? {
            output: {
              dir: outputRoot,
              serverDir: `${outputRoot}/server`,
              publicDir: `${outputRoot}/public`,
            },
          }
        : {}),
      // These packages are resolved dynamically by production server Workers.
      // Full tracing keeps the standalone .output deployment executable.
      traceDeps: [
        "figlet*",
        "zod*",
        "@jsquash/avif*",
        "@jsquash/oxipng*",
        "@napi-rs/canvas*",
        "zxing-wasm*",
        "@libwebp-wasm/img2webp*",
        "pdfjs-dist*",
        "@neslinesli93/qpdf-wasm*",
      ],
    }),
    tailwindcss(),
    tanstackStart({
      pages: prerenderPages,
      prerender: {
        enabled: true,
        failOnError: true,
        crawlLinks: true,
        concurrency: 8,
        autoStaticPathsDiscovery: false,
        filter: ({ path }) => prerenderPathnames.has(path),
      },
    }),
    react(),
    coverageEnabled
      ? []
      : [
          {
            ...appShellImportGraph(),
            applyToEnvironment: (environment: { name: string }) =>
              environment.name === "client",
          },
          ...VitePWA({
            strategies: "injectManifest",
            outDir: ".output/public",
            srcDir: "src",
            filename: "sw.ts",
            injectRegister: false,
            manifest: false,
            includeAssets: [
              "icon.svg",
              "favicon.ico",
              "favicon-16x16.png",
              "favicon-32x32.png",
              "apple-touch-icon.png",
              "pwa-192x192.png",
              "pwa-512x512.png",
              "pwa-maskable-192x192.png",
              "pwa-maskable-512x512.png",
            ],
            injectManifest: {
              buildPlugins: { vite: [coveragePlugin()] },
              globPatterns: [
                "**/*.{js,mjs,css,woff,woff2,wasm,png,svg}",
                "app-shell-imports.json",
              ],
              globIgnores: ["**/avif_enc-*.wasm", "**/worker-*.js"],
              additionalManifestEntries: [
                ...pdfManifestEntries(),
                ...["tree-sitter.wasm", "tree-sitter-bash.wasm"].map((url) => ({
                  url,
                  revision: createHash("sha256")
                    .update(
                      readFileSync(new URL(`./public/${url}`, import.meta.url)),
                    )
                    .digest("hex"),
                })),
              ],
              manifestTransforms: [
                async (manifest) => {
                  const complete = [
                    ...manifest,
                    ...avifManifestEntries(),
                    ...workerManifestEntries(),
                  ];
                  await captureProductionManifest(
                    complete,
                    process.env.TOOLTAB_COVERAGE_MANIFEST,
                  );
                  return { manifest: complete, warnings: [] };
                },
              ],
              // The local password-strength dictionaries produce a 2.12 MB worker.
              maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
            },
          }).map((plugin) => ({
            ...plugin,
            applyToEnvironment: (environment: { name: string }) =>
              environment.name === "client",
          })),
        ],
    serverWorkerEntries(),
  ],
});
