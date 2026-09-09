import {
  StdioServerTransport,
  serveStdio,
} from "@modelcontextprotocol/server/stdio";
import { resolveInputRoots } from "../../api/runtime/files";
import { createMcpServer } from "./mcp";

const mode = process.argv[2];
if (mode === "mcp") {
  const inputPaths: string[] = [];
  for (let index = 3; index < process.argv.length; index += 2) {
    if (process.argv[index] !== "--input-root" || !process.argv[index + 1])
      throw new Error("Expected --input-root /absolute/directory");
    inputPaths.push(process.argv[index + 1]);
  }
  const roots = await resolveInputRoots(inputPaths);
  const handle = serveStdio(() => createMcpServer(roots), {
    transport: new StdioServerTransport(process.stdin, process.stdout, {
      maxBufferSize: 64 * 1024 * 1024,
    }),
    onerror: () => console.error("ToolTab MCP connection error"),
  });
  for (const event of ["SIGINT", "SIGTERM"] as const)
    process.once(event, () => {
      void handle.close().finally(() => process.exit());
    });
} else {
  console.error(
    "Usage: bun src/features/mcp/runtime/cli.ts mcp [--input-root PATH]",
  );
  process.exitCode = 1;
}
