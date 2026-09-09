# ToolTab Agent Guide

## Scope

Work only in the current ToolTab project at `/Users/draco/Documents/Github/tooltab`. This directory is writable; the previous read-only baseline restriction no longer applies. Do not push, deploy, delete the old project, create docs/, or create recurring tasks. Protect existing and untracked work.

## Architecture

Two private Bun workspaces: `apps/web` and `packages/tools`. Application translations, Paraglide configuration and assets belong to the app. Per the latest user instruction, do not maintain Web Vitest tests. Keep application typecheck, build, visible functional/protocol acceptance. Library tests belong to the library. Root Vitest projects orchestrate testing; Vite builds the app and consumes library TypeScript exports.

The library owns algorithms, domain validation, defaults and structured errors. It must not import the app, React, translations or protocol frameworks. Use explicit environment exports and keep pure imports environment independent. The app imports public package exports only. Catalog metadata must not load implementations. Routes assemble features; dedicated code stays with its feature. Extract shared code for real reuse, not hypothetical reuse.

Each workspace declares the runtime packages and package-specific type dependencies its own source imports. Shared build commands remain at the root; do not rely on dependency hoisting to make an undeclared source dependency available. Keep the existing dependency version when changing ownership. Type declarations must describe the implementation actually used at runtime, including explicit version aliases.

The tools package declares TypeScript 5 as an OpenAPI AST runtime dependency; the root TypeScript 7 remains the typecheck tool. Core tests resolve the declared dependency without a compiler alias. Browser-specific OpenAPI compiler adapters remain application build responsibilities.

Keep dependency paths acyclic, including literal dynamic imports. A lazy implementation must not import its caller to obtain shared errors, limits or types. Put genuinely shared contracts in a lightweight module without environment or heavy dependency imports, while preserving established public exports. A private helper with one caller belongs in that caller's module unless it needs a separate runtime or bundling boundary. Verify that ordinary production output retains required dynamic chunks.

Biome noRestrictedImports enforces static imports, exports and literal dynamic-import boundaries: tools source cannot import React, application aliases or application paths, and application source cannot bypass the tools package exports. The noImportCycles rule runs through the same check command and ignores type-only cycles. The configured pattern restrictions did not flag literal require in the migration probe. These rules do not establish require, nonliteral dynamic-import or third-party dependency isolation; inspect those boundaries separately.

Review third-party dependency behavior before classifying an entry as pure: an explicit function argument does not prove that the dependency ignores browser globals. Preserve existing environmental behavior during migration and record unresolved pure/environment boundaries for acceptance. Static first-party import analysis is only evidence for the paths it resolves; it does not prove third-party purity or nonliteral imports safe.

## Verification

All executable first-party `packages/tools/src` code requires exactly 100% lines, statements, functions and branches globally and per file, including unimported source and library environment implementations. Never game scope or mock the implementation. No Web percentage gate or test project; app acceptance requires manual UI, protocol, resource, routing and offline acceptance, not arbitrary percentages.

Use root `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:coverage`, `bun run build`, and `bun run validate`. Both normal tests and coverage invoke Vitest explicitly through Node; build and production use Bun. CI pins Node 24.12.0 and Bun 1.3.14. Keep coverage and normal production outputs separate. Do not claim imported baseline code is migrated or accepted until verified.

## Collaboration

Astra owns architecture, exports, shared configuration, lockfile, integration, navigation and final verification. Luna owns bounded family implementation and tests; Terra handles complex Worker or protocol tasks. Root coordinates user annotations and visible-browser review while agents make disjoint source changes; agents do not start or control the user-owned service or browser. At most three child agents with compact context and disjoint file ownership. Stop repeating after two unsuccessful repairs and report evidence. Heavy validation is serial and source-frozen.

## UI and resources

Follow DESIGN.md. Inspect existing rendered pages before visual redesign. Use the user's visible browser and service; do not start or stop their development server. Isolated functional test services and browsers are allowed but cannot replace visible QA. Record unverified states. Worker, URLs, streams, listeners and artifacts have explicit owners; late results must never overwrite current state. Preserve actual cancellation and protocol-version semantics.

## Evidence

Maintain temporary migration and acceptance evidence outside source in `/tmp/tooltab-next-evidence/` and the current task. Bind results to source, lock/config and build fingerprints. Revalidate affected callers when shared code changes. No fabricated completion, coverage, browser or performance claims.

Web has no automated test suite or production smoke. Validate runs checks, types, core coverage and production build. Build success does not imply manual functional or visual acceptance.

Application messages use exactly one JSON per locale under `apps/web/messages/{locale}.json`, with nested tool objects and semantically shared message objects; do not split into domain files. Paraglide settings own the locale list and input pattern. Preserve all translated content and interpolation parameters. When shortening message keys, update every locale and static reference together, then regenerate through the application build; do not add alias messages or translation wrappers.

Tool routes only register feature components, SEO and pending UI. Each feature page owns its ToolPage composition and special instructions. Parent route layouts contain only generic layout and Outlet, not tool business content. UI uses Paraglide getLocale; SEO reads the request/navigation locale through Paraglide getLocale at execution time; callers do not pass locale or hard-coded paths. The seo message factory returns a Router head callback and derives the canonical pathname from match.pathname through official Paraglide URL normalization. Tool-specific head functions live in lightweight modules under their corresponding features/tools directory. Do not add an Outlet-only tools parent route. Do not recreate route wrapper functions or duplicate per-route toolId constants.

Paraglide nested keys use static string access such as m["tools.jsonFormatter.name"]. Biome has no equivalent to import/namespace; TypeScript checks generated message names, including computed string access. Do not dynamically index the full message namespace.

Pages and their local components call static Paraglide messages directly where rendered. Do not extract copy.ts, construct a locale-indexed copy object inside a page, or pass a translated message map through component props. Genuine capability configurations may store static message functions and call them at render time. Pass actual interpolation values to messages instead of substituting placeholder strings afterward.

Biome owns lint and formatting through biome.json. Use the existing lint, format and format:check commands; check combines lint and formatting, and validate retains its full gate. Keep React Hooks, accessibility, import boundaries and cycle rules enabled. Biome parses Tailwind v4 CSS directives but does not provide stylesheet-aware Tailwind class sorting equivalent to the previous formatter. Do not enable experimental useSortedClasses as a substitute for the project stylesheet. See README.md for migration differences. Only format owned files during concurrent work; never overwrite another task with a repository-wide automatic fix.

Core coverage collection records source, test, configuration, and report hashes in `coverage/run-identity.json`. The verifier rejects failed runs, missing reports, changed source, or changed reports; a previous coverage report cannot establish acceptance for new source.

Worker communication uses `apps/web/src/lib/worker-task.ts`. Streaming clients await each `session.send` before sending the next chunk and close the session in `finally`. Set `timeoutMs` only to preserve an established tool deadline; omitting it creates no timeout timer, while cancellation, errors and explicit close still release the Worker. Keep static Worker factories and domain error mapping in the caller.

Treat Worker messages as unknown input. Reuse `workerResult` for the existing result/error envelope, then validate the result shape needed by the caller. A malformed terminal message must reject and release the task; clearing its timer before an unguarded property read can leave the Promise pending forever. Preserve structured diagnostics and any request-ID or progress semantics. Do not replace synchronous concurrency-slot release with a Promise `finally` if that would reject an immediate retry after cancellation. Retained event handlers must ignore late responses after settlement.

JSON Schema generation and validation bound input traversal to 128 levels, matching the existing JSON input depth policy. Report `SchemaToolError("too_deep")` for excessive depth, including cyclic inputs, instead of exposing a native stack overflow. Shared references without cycles remain valid. Test the boundary with real nested objects and arrays; do not fabricate array lengths or replace the schema implementation.

Keep discovery-contract evidence separate from execution evidence. Comparing HTTP/OpenAPI or MCP tool lists proves the recorded names and declarations, not successful execution, cancellation, or resource cleanup. When HTTP and MCP schemas differ, inspect the exact difference before changing either adapter; for example, a root object constraint is redundant only when every union alternative already requires an object and all other schema content agrees. Record the actual MCP protocol revision and transport used. In-process Request/Response and source Worker probes do not establish network-disconnect behavior, production Worker resolution, or visible browser acceptance.

For native image processing in a Worker, release a loaded image's source and loader callbacks in `finally` after its last use. Include validation and canvas creation after loading inside that ownership scope. Clear Canvas backing storage before posting a terminal response, because the receiver may immediately terminate the Worker. Do not rely on Worker `finally` after forced termination; native cancellation and memory reclamation need separate evidence. Validate received result payloads as unknown, including nonempty byte output and positive safe-integer dimensions where required by the producer contract.
