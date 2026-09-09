import {
  createMcpHandler,
  isInitializeRequest,
  isJSONRPCNotification,
  isLegacyRequest,
  type McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";

const sessionLimit = 32;
const idleLifetime = 5 * 60_000;
const maximumLifetime = 30 * 60_000;

/** Legacy requests share an SDK protocol instance only within their opaque session. */
export function createMcpHttpTransport(factory: () => McpServer) {
  const modern = createMcpHandler(factory, {
    legacy: "reject",
    onerror: () => console.error("ToolTab MCP request error"),
  });
  type Session = {
    server: McpServer;
    transport: WebStandardStreamableHTTPServerTransport;
    created: number;
    touched: number;
    active: number;
    closing: Promise<void> | undefined;
  };
  const sessions = new Map<string, Session>();
  const allocations = new Set<Session>();
  let closed = false;
  const dispose = (session: Session): Promise<void> => {
    if (session.closing) return session.closing;
    allocations.delete(session);
    if (session.transport.sessionId)
      sessions.delete(session.transport.sessionId);
    // Defer close until the promise is stored: SDK onclose can reenter disposal.
    session.closing = Promise.resolve().then(() => session.server.close());
    return session.closing;
  };
  const expire = () => {
    const now = Date.now();
    for (const session of allocations)
      if (
        session.active === 0 &&
        (now - session.touched >= idleLifetime ||
          now - session.created >= maximumLifetime)
      )
        void dispose(session).catch(() =>
          console.error("ToolTab MCP session close error"),
        );
  };
  const timer = setInterval(expire, 30_000);
  timer.unref();
  const reject = (status: number, message: string) =>
    Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message } },
      { status },
    );
  return {
    async fetch(request: Request, parsedBody?: unknown) {
      if (closed) return reject(503, "MCP transport is closed.");
      if (!(await isLegacyRequest(request, parsedBody)))
        return modern.fetch(request, { parsedBody });
      expire();
      const id = request.headers.get("mcp-session-id");
      let session = id ? sessions.get(id) : undefined;
      if (id && !session) return reject(404, "Unknown MCP session.");
      if (!session) {
        if (request.method !== "POST" || !isInitializeRequest(parsedBody))
          return reject(400, "Initialize an MCP session first.");
        if (allocations.size >= sessionLimit)
          return reject(429, "MCP session capacity reached.");
        const server = factory();
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sessionId) => {
            if (session) sessions.set(sessionId, session);
          },
          onsessionclosed: () => {
            // handleDeleteRequest itself closes the SDK transport afterwards.
            if (session) {
              allocations.delete(session);
              sessions.delete(transport.sessionId ?? "");
            }
          },
        });
        session = {
          server,
          transport,
          created: Date.now(),
          touched: Date.now(),
          active: 0,
          closing: undefined,
        };
        allocations.add(session);
        const record = session;
        const onclose = server.server.onclose;
        server.server.onclose = () => {
          onclose?.();
          void dispose(record).catch(() =>
            console.error("ToolTab MCP session close error"),
          );
        };
        try {
          await server.connect(transport);
        } catch (error) {
          await dispose(record);
          throw error;
        }
      }
      if (request.method === "POST") session.touched = Date.now();
      const record = session;
      const toolRequest =
        parsedBody !== null &&
        typeof parsedBody === "object" &&
        "method" in parsedBody &&
        parsedBody.method === "tools/call";
      let released = !toolRequest;
      if (toolRequest) record.active++;
      const release = () => {
        if (released) return;
        released = true;
        record.active--;
        record.touched = Date.now();
        expire();
      };
      try {
        const response = await session.transport.handleRequest(request, {
          parsedBody,
        });
        // Legacy Protocol aborts the handler but suppresses its final response.
        // Close that request's SSE stream as well so cancelled calls release admission.
        if (
          response.status === 202 &&
          isJSONRPCNotification(parsedBody) &&
          parsedBody.method === "notifications/cancelled"
        ) {
          const requestId = parsedBody.params?.requestId;
          if (typeof requestId === "string" || typeof requestId === "number")
            session.transport.closeSSEStream(requestId);
        }
        if (!session.transport.sessionId) await dispose(session);
        if (!toolRequest || !response.body) {
          release();
          return response;
        }
        const reader = response.body.getReader();
        return new Response(
          new ReadableStream({
            async pull(controller) {
              try {
                const result = await reader.read();
                if (result.done) {
                  release();
                  controller.close();
                } else controller.enqueue(result.value);
              } catch (error) {
                release();
                controller.error(error);
              }
            },
            async cancel(reason) {
              try {
                await reader.cancel(reason);
              } finally {
                release();
              }
            },
          }),
          {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          },
        );
      } catch (error) {
        release();
        await dispose(session);
        throw error;
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      await Promise.allSettled([
        modern.close(),
        ...Array.from(allocations, dispose),
      ]);
    },
  };
}
