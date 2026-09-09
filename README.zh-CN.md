# ToolTab

[English](README.md) | **简体中文**

面向日常开发、文本、数据和媒体处理的浏览器工具箱。大部分工具在本地处理输入；需要联网的工具会说明目标服务。

## 功能

- 格式化、转换、校验和生成文本及结构化数据。
- 在浏览器中处理图片、PDF、编码、哈希和证书。
- 通过搜索和分类查找工具。
- 支持简体中文、英文，以及明暗主题切换。
- 缓存后的本地工具可离线使用；联网工具仍需网络连接。

## 快速开始

安装 Bun **1.3.14** 和 Node **24.12.0**，然后运行：

```bash
bun install
bun run build
bun run dev
```

开发服务端口为 `3001`。首次构建生成类型检查所需的 Paraglide 消息和 TanStack 路由文件。

## 配置

将 `apps/web/.env.example` 复制为 `apps/web/.env.local`，并将 `VITE_BASE_URL` 设置为公开访问地址，例如 `https://tooltab.example`。站点元数据在构建时读取该值。

翻译存放在 `apps/web/messages/{locale}.json`，语言清单由 `apps/web/project.inlang/settings.json` 定义。

## 部署

### Cloudflare Workers

在 [wrangler.json](wrangler.json) 中设置 Worker 名称，然后构建和预览：

```bash
NITRO_PRESET=cloudflare-module bun run build
bunx wrangler dev
```

检查部署打包，或在登录后部署：

```bash
bunx wrangler deploy --dry-run
bunx wrangler deploy
```

关联 Cloudflare Git 构建时使用以下设置：

| 设置 | 值 |
| --- | --- |
| 根目录 | 仓库根目录 |
| 生产分支 | `main` |
| 构建命令 | `NITRO_PRESET=cloudflare-module bun run build` |
| 部署命令 | `npx wrangler deploy` |

将 `VITE_BASE_URL` 配置为构建变量。构建与部署分开执行，`wrangler.json` 不设置自定义构建命令。已启用 Observability 用于运行时诊断，不需要 R2 或 Containers。

### Bun

```bash
bun run build
bun run start
```

Bun 构建会预渲染页面，Workers 构建按请求渲染。两种目标都输出到 `apps/web/.output`，切换目标时需重新构建。

## 开发

项目使用 React、TanStack Start、HeroUI、Tailwind CSS、Paraglide 和 Nitro，组织为两个私有 Bun workspace：

| 目录 | 内容 |
| --- | --- |
| `apps/web` | 页面、路由、翻译、样式和浏览器资源 |
| `packages/tools` | 算法、领域校验和库测试 |

`main` 提供浏览器应用。HTTP API 和 MCP 服务在 `feature/api-mcp` 分支单独维护，不属于上述 Workers 部署范围。

| 命令 | 用途 |
| --- | --- |
| `bun run check` | Lint 和格式检查 |
| `bun run typecheck` | TypeScript 检查 |
| `bun run test` | 库测试 |
| `bun run test:coverage` | 库覆盖率与报告校验 |
| `bun run validate` | 检查、类型、库覆盖率及 Bun 生产构建 |

库源码要求全局及每文件的行、语句、函数、分支覆盖率均为 100%。浏览器功能和 Workers 运行时需单独验收。

## 参与贡献

工程规则见 [AGENTS.md](AGENTS.md)，界面规范见 [DESIGN.md](DESIGN.md)。修改 README 时保持中英文内容同步。

运行 `bun run hooks:install` 启用 Lefthook。提交遵循 Conventional Commits；提交前执行检查，push 前执行完整验证。CI 在 `main` 验证通过后通过 Semantic Release 生成版本和 GitHub Release，workspace 包不发布到 npm。

## 许可证

[MIT](LICENSE)。第三方资源声明位于 [apps/web/public/licenses](apps/web/public/licenses)。
