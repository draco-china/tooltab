# ToolTab

**English** | [简体中文](README.zh-CN.md)

A browser toolbox for everyday development, text, data, and media tasks. Most tools process input locally; tools that need network access identify the services they contact.

## Features

- Format, convert, validate, and generate text and structured data.
- Work with images, PDFs, encodings, hashes, and certificates in the browser.
- Find tools through search and categories.
- Switch between English and Simplified Chinese, with light and dark themes.
- Use cached local tools offline; network-dependent tools require a connection.

## Getting started

Install Bun **1.3.14** and Node **24.12.0**, then run:

```bash
bun install
bun run build
bun run dev
```

The development server listens on port `3001`. The initial build generates Paraglide messages and TanStack route files required by typechecking.

## Configuration

Copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_BASE_URL` to your public origin, for example `https://tooltab.example`. Site metadata uses this value at build time.

Translations are stored in `apps/web/messages/{locale}.json`. The locale list is defined in `apps/web/project.inlang/settings.json`.

## Deployment

### Cloudflare Workers

Set the Worker name in [wrangler.json](wrangler.json), then build and preview:

```bash
NITRO_PRESET=cloudflare-module bun run build
bunx wrangler dev
```

Check deployment packaging or deploy after authenticating:

```bash
bunx wrangler deploy --dry-run
bunx wrangler deploy
```

For Cloudflare's Git integration:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Production branch | `main` |
| Build command | `NITRO_PRESET=cloudflare-module bun run build` |
| Deploy command | `npx wrangler deploy` |

Configure `VITE_BASE_URL` as a build variable. Build and deploy are separate steps; `wrangler.json` does not define a custom build command. Observability is enabled for runtime diagnostics. R2 and Containers are not required.

### Bun

```bash
bun run build
bun run start
```

Bun builds prerender pages; Workers builds render them on request. Both targets write to `apps/web/.output`, so rebuild when switching targets.

## Development

The project uses React, TanStack Start, HeroUI, Tailwind CSS, Paraglide, and Nitro, organized as two private Bun workspaces:

| Directory | Contents |
| --- | --- |
| `apps/web` | Pages, routes, translations, styles, and browser resources |
| `packages/tools` | Algorithms, domain validation, and library tests |

`main` contains the browser application. HTTP API and MCP services are maintained separately on `feature/api-mcp` and are not part of the Workers deployment described above.

| Command | Purpose |
| --- | --- |
| `bun run check` | Lint and formatting checks |
| `bun run typecheck` | TypeScript checks |
| `bun run test` | Library tests |
| `bun run test:coverage` | Library coverage and report verification |
| `bun run validate` | Checks, types, library coverage, and the Bun production build |

Library source requires 100% line, statement, function, and branch coverage globally and per file. Browser behavior and Workers runtime acceptance are verified separately.

## Contributing

Read [AGENTS.md](AGENTS.md) for engineering rules and [DESIGN.md](DESIGN.md) for UI guidelines. Keep both README translations in sync.

Run `bun run hooks:install` to enable Lefthook. Commits follow Conventional Commits; hooks run checks before commits and full validation before pushes. CI uses Semantic Release to create versions and GitHub Releases after validation on `main`. Workspace packages are not published to npm.

## License

[MIT](LICENSE). Third-party resource notices are maintained under [apps/web/public/licenses](apps/web/public/licenses).
