# ToolTab API runtime

TanStack Start 和 Nitro 进程同时提供网页、HTTP API 与 MCP。HTTP API 与 operation catalog 位于本目录，MCP 协议和 stdio CLI 位于 `src/features/mcp/runtime/`。operation catalog 从 `operations.ts` 生成，并与 `src/features/tools/catalog/registry.ts` 的 215 个网页工具保持一致。

## HTTP API

运行时契约是唯一接口依据：

- `GET /api/v1/tools`：工具目录与输入 schema
- `GET /api/v1/openapi.yaml`：OpenAPI 3.1 YAML
- `GET /api/v1/openapi.json`：同一 OpenAPI 文档的 JSON 表示
- `POST /api/v1/tools/:toolId`：执行工具
- `POST /api/v1/uploads?toolId=:toolId`：统一临时输入上传
- `GET /api/v1/artifacts/:id`：下载临时产物
- `DELETE /api/v1/artifacts/:id`：删除临时上传或产物

接口无需 Bearer token。上传和产物使用运行时返回的临时凭据约束访问；调用方应直接使用 OpenAPI 中声明的字段和响应，不复制手写 schema。

生产构建通过 `VITE_BASE_URL` 得到公开 origin 与允许的 Host。服务拒绝浏览器跨源调用、未知工具、未知字段和越界输入，并将业务错误转换为结构化响应，不返回内部堆栈。

## MCP

部署后的 `POST /mcp` 提供无会话 Streamable HTTP MCP。客户端连接一次即可通过 `tools/list` 发现全部工具，并通过 `tools/call` 执行；不需要为单个工具配置独立连接。

```json
{
  "mcpServers": {
    "tooltab": {
      "url": "https://tooltab.example/mcp"
    }
  }
}
```

本地 stdio 入口：

```bash
bun src/features/mcp/runtime/cli.ts mcp
```

只有 stdio 模式可以通过 `--input-root /absolute/directory` 授权读取本机路径。远程 HTTP 和 MCP 仅接受 inline 数据或上传 ID，不接收服务器文件路径。

## 临时文件

上传与产物保存在权限受限的临时目录，并受单项容量、总容量、数量和 TTL 限制。文件型工具可返回 inline 数据或 artifact 元数据；远程调用返回下载 URL，本地 stdio MCP 可返回授权范围内的实际路径。调用方下载完成后应删除不再需要的 artifact。

每个工具的精确容量、输入载体、输出模式和错误结构均由 OpenAPI 与运行时 schema 提供，避免在说明文档中复制容易失效的数字清单。

## 验证

```bash
bunx vitest run tests/api/runtime/service-api.test.ts tests/mcp/runtime/service-mcp.test.ts tests/mcp/runtime/service-mcp-http.test.ts tests/api/docs/developer-pages.test.ts
bun run build
bun run validate
```

`validate` 会在构建后从隔离的 `.output` 副本启动服务并调用真实 Worker 路径，用于发现构建产物对源码目录的意外依赖。
