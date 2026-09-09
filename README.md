# ToolTab

Two private Bun workspaces:

- `apps/web` (`@workspace/web`): the application, translations, routes and protocols.
- `packages/tools` (`@workspace/tools`): TypeScript domain functions and their tests.

## Development

Use Bun 1.3.14 and Node 24.12.0. Run `bun install`, then `bun run build` to generate Paraglide and TanStack route files before the first typecheck. Start development manually with `bun run dev` (port 3001).

`bun run validate` runs lint/format checks, TypeScript project checks, library tests with full core coverage, and the production build. There is no Web automated test project or production smoke script. Web functionality, protocols and visual behavior require manual acceptance.

## Lint and formatting

Biome 2.5.12 is pinned at the root. Both workspaces inherit `biome.json`; there are no workspace-local lint/format scripts. Run `bun run lint` (warnings fail), `bun run format:check` (read-only), or `bun run format` (writes the whole repository). During concurrent work use `bunx --no-install biome format --write path/to/owned-file` instead. `check` still runs lint followed by formatting; CI reaches both through `validate`. Generated sources, build/coverage outputs and vendored PDF.js/license files remain excluded. The VS Code recommendation and supported-language formatter use the official Biome extension.

The recommended rule preset remains enabled, with explicit errors for Hooks dependencies/top-level usage, array index keys, dangerous HTML, unused variables/parameters, import boundaries and cycles. Existing justified suppressions use Biome comments; comments for checks without a corresponding active Biome diagnostic remain explanations. No business logic was changed for this migration.

Differences from the previous Oxlint/Oxfmt toolchain:

- Biome `noRestrictedImports` preserves the configured static import, re-export and literal dynamic-import patterns. `noImportCycles` scans project dependencies and ignores type-only cycles. A migration probe caught these boundaries and runtime cycles. The same pattern probe did **not** flag literal `require`, so do not treat it as CommonJS isolation or as validation of nonliteral paths/third-party internals.
- `useExhaustiveDependencies` and `useHookAtTopLevel` preserve Hooks checks, but dependency inference and suppression placement differ. Existing cleanup-ref comments need no Biome suppression; intentionally triggered recalculations keep their existing exemptions. New diagnostics still require review, not automatic dependency removal.
- `noDoubleEquals` with `ignoreNull: true` preserves nullish comparisons, but does not reproduce every `eqeqeq: smart` exception (such as `typeof` and same-type literal comparisons).
- Unused variables and function parameters are separate rules. Rest siblings remain ignored and Biome permits underscore-prefixed unused bindings; its analysis is not identical to Oxlint's configurable `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern` checks.
- Biome has no direct equivalent for the old `import/namespace` and `import/default` export checks, `typescript/triple-slash-reference`, `unicorn/no-useless-spread`, or `oxc/number-arg-out-of-range`. TypeScript remains a separate gate for statically typed imports; it is not a replacement for all these lint policies. The two recommended/correctness rule sets are not one-to-one: Biome also introduces diagnostics such as non-null assertions and type-only import style.
- CSS formatting and Tailwind v4 directive parsing are enabled. Biome's experimental `useSortedClasses` cannot consume the project stylesheet or fully support custom utilities/variants and responsive ordering, so it is not enabled as an equivalent to Oxfmt's `sortTailwindcss.stylesheet`. Project-aware Tailwind class sorting is no longer enforced.
- Biome does not provide equivalent Markdown/YAML formatting. README/AGENTS and CI YAML require manual formatting. Supported JS/TS/JSON/CSS output also differs from Oxfmt; a clean old formatter baseline does not imply a clean Biome baseline. Import organization is not added to the `check` contract.

Official references: [configuration](https://biomejs.dev/reference/configuration/), [restricted imports](https://biomejs.dev/linter/rules/no-restricted-imports/), [Hooks dependencies](https://biomejs.dev/linter/rules/use-exhaustive-dependencies/), and [class sorting limitations](https://biomejs.dev/linter/rules/use-sorted-classes/).

## Calling the core

Import a public capability subpath directly from the application:

```ts
import { formatJson } from "@workspace/tools/json";

const output = formatJson('{"enabled":true}', "2");
```

Both packages are private. The application declares `@workspace/tools` with
`workspace:*`; Vite consumes its exported TypeScript sources. Do not import
`packages/tools/src` from application code. Browser and server entrypoints remain
explicit where a capability requires those environments.

## Internationalization

The app owns one JSON per locale. Use nested tool and shared objects with short meaningful keys, official Paraglide APIs, and statically known message references. Do not split message catalogs into per-feature files or add translation proxies.

## Migration

Migration is in progress. Preserved application source does not mean a tool has completed migration or acceptance. The tools package requires exactly 100% lines, statements, functions and branches globally and per file. See AGENTS.md for engineering rules and DESIGN.md for visual and UX requirements.

## Git hooks and releases

After `bun install`, run `bun run hooks:install` to enable Lefthook locally.
Pre-commit runs `bun run check`, commit-msg validates Conventional Commits, and
pre-push runs `bun run validate`. Hooks do not automatically rewrite or stage files.
Run the initial build described above before validation on a fresh checkout.

Pushes to `main` release only after the CI validation job succeeds. Semantic Release
uses Conventional Commits: `fix` and `perf` produce patches, `feat` produces minor
versions, and breaking changes produce major versions. The first release is 1.0.0.
Ordinary documentation, test, build and maintenance commits do not release.
It updates the root `package.json` version and `bun.lock`, commits them as
`chore(release): <version> [skip ci]`, and creates a `v<version>` tag and GitHub Release.
Both workspaces remain private; no npm package is published. Manual CI runs only validate.

The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`. The repository
must allow the release job to push release commits and tags. If branch protection
blocks those writes, configure an approved GitHub App identity for checkout and
release. Local `bun run release` is a publishing command, not a validation command.
