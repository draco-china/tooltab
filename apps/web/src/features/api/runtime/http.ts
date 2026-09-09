import { once } from "node:events";
import { createReadStream } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import {
  localhostAllowedHostnames,
  validateHostHeader,
} from "@modelcontextprotocol/server";
import { stringify } from "yaml";
import * as z from "zod/v4";
import { normalizeSiteOrigin, siteOrigin } from "@/lib/site-origin";
import { createMcpHttpTransport } from "../../mcp/runtime/http-transport";
import { createMcpServer } from "../../mcp/runtime/mcp";
import { ArtifactStore } from "./artifacts";
import { metadata, operationError, operations } from "./operations";

function json(status: number, value: unknown, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return Response.json(value, {
    status,
    headers: responseHeaders,
  });
}
function error(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: HeadersInit,
) {
  return json(
    status,
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    headers,
  );
}
const scopedUploadLimits: Record<string, number> = {
  "screen-recorder": 256 * 1048576,
  camera: 20 * 1048576,
  "audio-recorder": 128 * 1048576,
  "archive-viewer": 128 * 1048576,
  "openapi-to-typescript-converter": 32 * 1048576,
  "gif-to-animated-webp-converter": 64 * 1048576,
  "gif-to-apng-converter": 64 * 1048576,
  "png-optimizer": 64 * 1048576,
  "svg-optimizer": 16 * 1048576,
  "image-to-avif-converter": 64 * 1048576,
  "image-to-ico": 64 * 1048576,
  "image-to-pdf-converter": 128 * 1048576,
  "remove-pdf-owner-password": 128 * 1048576,
  "pdf-info-viewer": 128 * 1048576,
  "pdf-text-extractor": 128 * 1048576,
  "pdf-to-image-converter": 128 * 1048576,
  "pdf-merger": 128 * 1048576,
  "pdf-splitter": 128 * 1048576,
  "pdf-page-organizer": 128 * 1048576,
  "pdf-page-number-adder": 128 * 1048576,
  "exif-viewer": 64 * 1048576,
  "image-metadata-cleaner": 64 * 1048576,
  "csv-to-json-converter": 32 * 1048576,
  "json-to-csv-converter": 32 * 1048576,
  "aes-encryptor": 32 * 1048576,
  "aes-decryptor": 48 * 1048576,
};
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "ToolTab API",
    version: "0.1.0",
    description:
      "Run ToolTab tools over HTTP. Large inputs use temporary uploads and generated files are returned as one-hour artifacts.",
  },
  servers: [{ url: "/", description: "Current ToolTab deployment" }],
  security: [],
  tags: [{ name: "Tools" }, { name: "Files" }, { name: "Catalog" }],
  paths: {
    "/api/v1/uploads": {
      post: {
        operationId: "upload_file",
        tags: ["Files"],
        security: [],
        summary: "Upload temporary input bytes",
        description:
          "Upload raw bytes with a 20 MiB default limit. Pass a supported toolId to apply that tool's existing input limit. Returns uploadId, bytes, expiresAt, appliedLimit, and the optional toolId.",
        parameters: [
          {
            name: "toolId",
            in: "query",
            required: false,
            description:
              "Tool ID with a dedicated upload limit. Unknown or unsupported IDs are rejected.",
            schema: {
              type: "string",
              enum: Object.keys(scopedUploadLimits),
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        responses: {
          "201": {
            description: "Temporary upload ID valid one hour",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["uploadId", "bytes", "expiresAt", "appliedLimit"],
                  properties: {
                    uploadId: { type: "string", format: "uuid" },
                    bytes: { type: "integer", minimum: 0 },
                    expiresAt: { type: "string", format: "date-time" },
                    appliedLimit: { type: "integer", minimum: 1 },
                    toolId: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "415": { $ref: "#/components/responses/UnsupportedMediaType" },
          "413": { $ref: "#/components/responses/PayloadTooLarge" },
        },
      },
    },
    "/api/v1/artifacts/{id}": {
      delete: {
        operationId: "delete_artifact",
        tags: ["Files"],
        security: [],
        summary: "Delete a temporary artifact",
        description:
          "Delete a temporary upload or generated artifact immediately; idempotent.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": { description: "Artifact removed or already absent" },
        },
      },
      get: {
        operationId: "download_artifact",
        tags: ["Files"],
        security: [],
        summary: "Download a temporary artifact",
        description:
          "Returns the generated file with its stored media type and filename. Artifacts expire after one hour.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Generated artifact bytes",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/tools": {
      get: {
        operationId: "list_tools",
        tags: ["Catalog"],
        security: [],
        summary: "List available tools",
        responses: { "200": { description: "Implemented tools and schemas" } },
      },
    },
    "/api/v1/openapi.json": {
      get: {
        operationId: "get_openapi_json",
        tags: ["Catalog"],
        security: [],
        summary: "Download the OpenAPI document as JSON",
        responses: { "200": { description: "OpenAPI 3.1 document" } },
      },
    },
    "/api/v1/openapi.yaml": {
      get: {
        operationId: "get_openapi_yaml",
        tags: ["Catalog"],
        security: [],
        summary: "Download the OpenAPI document as YAML",
        responses: { "200": { description: "OpenAPI 3.1 document" } },
      },
    },
    "/api/v1/popular-tools": {
      get: {
        operationId: "list_popular_tools",
        tags: ["Catalog"],
        security: [],
        summary: "List popular tools",
        description:
          "Return the most requested tool IDs from aggregate Cloudflare HTTP analytics, or the built-in fallback list.",
        responses: {
          "200": {
            description: "Popular registered tool IDs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["toolIds", "source"],
                  properties: {
                    toolIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                    source: { enum: ["cloudflare", "fallback"] },
                  },
                },
              },
            },
          },
        },
      },
    },
    ...Object.fromEntries(
      metadata.map((tool) => [
        `/api/v1/tools/${tool.id}`,
        {
          post: {
            operationId: tool.name,
            tags: ["Tools"],
            security: [],
            summary:
              tool.description.match(/^[^.!?]+[.!?]?/)?.[0] ??
              tool.id
                .split("-")
                .map((part) => part[0]?.toUpperCase() + part.slice(1))
                .join(" "),
            description: tool.description,
            requestBody: {
              required: true,
              content: { "application/json": { schema: tool.inputSchema } },
            },
            responses: {
              "200": {
                description: "Tool result",
                content: { "application/json": { schema: tool.outputSchema } },
              },
              "400": { $ref: "#/components/responses/BadRequest" },
              "413": { $ref: "#/components/responses/PayloadTooLarge" },
              "415": { $ref: "#/components/responses/UnsupportedMediaType" },
              "503": { $ref: "#/components/responses/Unavailable" },
            },
          },
        },
      ]),
    ),
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: "object",
        additionalProperties: false,
        required: ["error"],
        properties: {
          error: {
            type: "object",
            additionalProperties: false,
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      Artifact: {
        type: "object",
        description:
          "Temporary generated file. HTTP responses include downloadUrl; MCP responses can include an authorized local path.",
        required: ["id", "filename", "mimeType", "bytes", "expiresAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          filename: { type: "string" },
          mimeType: { type: "string" },
          bytes: { type: "integer", minimum: 0 },
          expiresAt: { type: "string", format: "date-time" },
          downloadUrl: { type: "string", format: "uri-reference" },
          path: { type: "string" },
        },
      },
    },
    responses: Object.fromEntries(
      [
        ["BadRequest", "Invalid request or tool input"],
        ["PayloadTooLarge", "Request exceeds the endpoint limit"],
        ["UnsupportedMediaType", "Unsupported request content type"],
        ["NotFound", "Unknown or expired resource"],
        ["Unavailable", "Tool execution is temporarily unavailable"],
      ].map(([name, description]) => [
        name,
        {
          description,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      ]),
    ),
  },
};
export const openapiYaml = stringify(openapi, { lineWidth: 0 });
const mcpControlMessage = z.union([
  z.strictObject({
    jsonrpc: z.literal("2.0"),
    method: z.literal("notifications/initialized"),
    params: z.record(z.string(), z.unknown()).optional(),
  }),
  z.strictObject({
    jsonrpc: z.literal("2.0"),
    method: z.literal("notifications/cancelled"),
    params: z.strictObject({
      requestId: z.union([z.string(), z.number()]),
      reason: z.string().optional(),
      _meta: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);
const mcpBodyLimit = 96 * 1024 * 1024;
const longRunningOperations = new Set<string>([
  "image-to-webp",
  "css-gradient-generator",
  "unicode-invisible-character-checker",
  "morse-code-converter",
  "lorem-ipsum-generator",
  "jsonpath-tester",
  "jmespath-tester",
  "aes-encryptor",
  "aes-decryptor",
  "exif-viewer",
  "image-metadata-cleaner",
  "xxhash-xxh32-hash-text-or-file",
  "xxhash-xxh64-hash-text-or-file",
  "xxhash-xxh3-64-hash-text-or-file",
  "xxhash-xxh3-128-hash-text-or-file",
  "crc-checksum-calculator",
  "murmurhash3-x86-32-hash-text-or-file",
  "murmurhash3-x86-128-hash-text-or-file",
  "murmurhash3-x64-128-hash-text-or-file",
  "markdown-previewer",
  "markdown-to-html-converter",
  "html-to-markdown-converter",
  "pdf-merger",
  "pdf-splitter",
  "pdf-page-organizer",
  "pdf-page-number-adder",
  "ripemd128-hash-text-or-file",
  "ripemd256-hash-text-or-file",
  "ripemd320-hash-text-or-file",
  "siphash-2-4-hash-text-or-file",
  "siphash-128-2-4-hash-text-or-file",
  "pdf-info-viewer",
  "pdf-text-extractor",
  "pdf-to-image-converter",
  "robots-txt-generator",
  "sitemap-xml-generator",
  "qr-code-generator",
  "qr-code-reader",
  "png-optimizer",
  "svg-optimizer",
  "barcode-generator",
  "barcode-reader",
  "curl-converter",
  "gif-to-animated-webp-converter",
  "gif-to-apng-converter",
  "openapi-to-typescript-converter",
  "docker-run-to-compose-converter",
  "pgp-key-generator",
  "csr-generator",
  "certificate-public-key-parser",
  "image-to-avif-converter",
  "image-to-ico",
  "ssh-key-generator",
  "ssh-public-key-fingerprint",
  "jwt-decoder-verifier",
  "jwt-signer",
  "jwk-pem-converter",
  "prettier-code-formatter",
  "sql-formatter-and-linter",
  "image-to-pdf-converter",
  "remove-pdf-owner-password",
  "cityhash64-hash-text-or-file",
  "highwayhash-hash-text-or-file",
  "md4-hash-text-or-file",
  "sm3-hash-text-or-file",
  "whirlpool-hash-text-or-file",
  "json-diff-path",
  "json-schema-generator",
  "json-schema-validator",
  "pbkdf2-key-derivation",
  "scrypt-key-derivation",
  "random-password-generator",
  "password-strength-checker",
  "argon2-hash-password",
  "argon2-hash-password-verifier",
  "bcrypt-hash-password",
  "bcrypt-hash-password-verifier",
  "json-to-xml-converter",
  "xml-to-json-converter",
  "file-to-data-uri-converter",
  "data-uri-to-file-converter",
  "json-to-yaml-converter",
  "yaml-to-json-converter",
  "json-to-toml-converter",
  "toml-to-json-converter",
  "yaml-to-toml-converter",
  "toml-to-yaml-converter",
  "text-diff",
  "regex-tester-replacer",
  "cidrs-merger-excluder",
  "csv-to-json-converter",
  "json-to-csv-converter",
  "hmac-generator",
  "sri-hash-generator",
  "list-comparer",
  "slug-generator",
]);

function operationTimeout(id: string) {
  if (id === "gif-to-animated-webp-converter" || id === "gif-to-apng-converter")
    return 610_000;
  return longRunningOperations.has(id) ? 300_000 : 10_000;
}

class BodyTooLargeError extends Error {}

async function readBody(request: Request, limit: number) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit)
    throw new BodyTooLargeError();
  if (!request.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.body as AsyncIterable<Uint8Array>) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export function configuredAllowedHosts(origin = siteOrigin()) {
  const hostname = new URL(normalizeSiteOrigin(origin)).hostname;
  return hostname === "localhost" ? localhostAllowedHostnames() : [hostname];
}

export function createServiceRuntime(options: { siteOrigin?: string } = {}) {
  const artifacts = new ArtifactStore();
  const allowedHosts = configuredAllowedHosts(options.siteOrigin);
  const mcp = createMcpHttpTransport(() =>
    createMcpServer([], { artifacts, remote: true }),
  );
  let mcpReads = 0;
  let mcpControls = 0;
  let activeRequests = 0;
  let closed = false;

  const trackResponse = (
    response: Response,
    done = () => {
      activeRequests--;
    },
  ) => {
    if (!response.body) {
      done();
      return response;
    }
    const reader = response.body.getReader();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      done();
    };
    return new Response(
      new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              release();
              controller.close();
            } else controller.enqueue(value);
          } catch (cause) {
            release();
            controller.error(cause);
          }
        },
        async cancel(reason) {
          release();
          await reader.cancel(reason);
        },
      }),
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  };

  const run = async (request: Request): Promise<Response> => {
    if (closed)
      return error(503, "RUNTIME_UNAVAILABLE", "Service runtime is closed.");
    if (
      !validateHostHeader(request.headers.get("host"), allowedHosts).ok ||
      request.headers.has("origin")
    )
      return error(
        403,
        "FORBIDDEN",
        "Requests must use an allowed Host and omit the browser Origin header.",
      );

    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/mcp") {
      if (mcpReads >= 4)
        return error(429, "BUSY", "MCP request input capacity reached.");
      mcpReads++;
      let release: (() => void) | undefined;
      try {
        const body =
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await readBody(request, mcpBodyLimit);
        let parsedBody: unknown;
        // Session deletion has no JSON body; retain validation for POST and nonempty bodies.
        if (body && (body.length > 0 || request.method !== "DELETE")) {
          try {
            parsedBody = JSON.parse(body.toString());
          } catch {
            return error(400, "INVALID_INPUT", "Invalid MCP JSON body.");
          }
        }
        const control =
          request.method === "GET" ||
          request.method === "DELETE" ||
          mcpControlMessage.safeParse(parsedBody).success;
        if (control) {
          if (mcpControls >= 40)
            return error(429, "BUSY", "MCP control capacity reached.");
          mcpControls++;
          release = () => {
            mcpControls--;
          };
        } else {
          if (activeRequests >= 2)
            return error(
              429,
              "BUSY",
              "At most two tool requests can run at once.",
            );
          activeRequests++;
          release = () => {
            activeRequests--;
          };
        }
        const response = await mcp.fetch(
          new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body,
            signal: request.signal,
          }),
          parsedBody,
        );
        const result = trackResponse(response, release);
        release = undefined;
        return result;
      } catch (cause) {
        release?.();
        if (cause instanceof BodyTooLargeError)
          return error(
            413,
            "BODY_TOO_LARGE",
            `Maximum MCP request size is ${mcpBodyLimit} bytes.`,
            undefined,
            { Connection: "close" },
          );
        if (request.signal.aborted)
          return error(400, "INVALID_INPUT", "Request interrupted.");
        return error(
          500,
          "RUNTIME_UNAVAILABLE",
          "MCP request handling failed.",
        );
      } finally {
        mcpReads--;
      }
    }

    if (request.method === "GET" && pathname === "/api/v1/tools")
      return json(200, { tools: metadata });
    if (request.method === "GET" && pathname === "/api/v1/openapi.json")
      return json(200, openapi);
    if (request.method === "GET" && pathname === "/api/v1/openapi.yaml")
      return new Response(openapiYaml, {
        headers: {
          "Content-Type": "application/yaml; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });

    if (pathname === "/api/v1/uploads") {
      if (request.method !== "POST")
        return error(405, "METHOD_NOT_ALLOWED", "Use POST.", undefined, {
          Allow: "POST",
        });
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/octet-stream"
      )
        return error(
          415,
          "INVALID_MEDIA_TYPE",
          "Expected application/octet-stream.",
        );
      if (activeRequests >= 2)
        return error(429, "BUSY", "Two requests already active.");
      const toolIds = url.searchParams.getAll("toolId");
      const unknownParameters = [...url.searchParams.keys()].filter(
        (name) => name !== "toolId",
      );
      if (toolIds.length > 1 || unknownParameters.length > 0)
        return error(
          400,
          "INVALID_INPUT",
          "Expected at most one toolId query parameter.",
        );
      const toolId = toolIds[0];
      if (toolId && !Object.hasOwn(scopedUploadLimits, toolId))
        return error(
          400,
          "INVALID_INPUT",
          "Unknown or unsupported upload toolId.",
        );
      const uploadLimit = toolId
        ? scopedUploadLimits[toolId]
        : 20 * 1024 * 1024;
      const declaredLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > uploadLimit)
        return error(
          413,
          "ARTIFACT_TOO_LARGE",
          "Upload exceeds its input limit.",
          undefined,
          { Connection: "close" },
        );
      activeRequests++;
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(10_000),
      ]);
      try {
        const record = await artifacts.write(
          (request.body ?? []) as AsyncIterable<Uint8Array>,
          {
            limit: uploadLimit,
            filename: "upload",
            mimeType: "application/octet-stream",
            kind: "upload",
          },
          signal,
        );
        return json(201, {
          uploadId: record.id,
          bytes: record.bytes,
          expiresAt: record.expiresAt,
          appliedLimit: uploadLimit,
          ...(toolId ? { toolId } : {}),
        });
      } catch (cause) {
        const failure = operationError(cause);
        return error(
          failure.status,
          failure.code,
          failure.message,
          "details" in failure ? failure.details : undefined,
        );
      } finally {
        activeRequests--;
      }
    }

    if (pathname.startsWith("/api/v1/artifacts/")) {
      const id = pathname.slice("/api/v1/artifacts/".length);
      if (request.method === "DELETE") {
        try {
          await artifacts.remove(id);
          return new Response(null, {
            status: 204,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (cause) {
          const failure = operationError(cause);
          return error(
            failure.status,
            failure.code,
            failure.message,
            "details" in failure ? failure.details : undefined,
          );
        }
      }
      if (request.method !== "GET")
        return error(405, "METHOD_NOT_ALLOWED", "Use GET.", undefined, {
          Allow: "GET, DELETE",
        });
      try {
        const record = await artifacts.get(id);
        // RFC 6266: use an ASCII fallback and UTF-8 filename* for Unicode names.
        const filename = Buffer.from(record.filename, "utf8").toString("utf8");
        const fallback = filename.replace(/[^\u0020-\u007e]|["\\]/g, "_");
        const disposition = `attachment; filename="${fallback}"`;
        const encoded = encodeURIComponent(filename).replace(
          /['()*]/g,
          (character) =>
            `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        const stream = Readable.toWeb(createReadStream(record.path));
        return new Response(stream as unknown as ReadableStream, {
          headers: {
            "Content-Type": record.mimeType,
            "Content-Length": String(record.bytes),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition":
              filename === fallback
                ? disposition
                : `${disposition}; filename*=UTF-8''${encoded}`,
          },
        });
      } catch (cause) {
        const failure = operationError(cause);
        return error(
          failure.status,
          failure.code,
          failure.message,
          "details" in failure ? failure.details : undefined,
        );
      }
    }

    const operation = operations.find(
      (candidate) => pathname === `/api/v1/tools/${candidate.id}`,
    );
    if (!operation)
      return error(404, "NOT_FOUND", "Tool or endpoint not found.");
    if (request.method !== "POST")
      return error(405, "METHOD_NOT_ALLOWED", "Use POST.", undefined, {
        Allow: "POST",
      });
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return error(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json.");
    if (activeRequests >= 2)
      return error(429, "BUSY", "At most two tool requests can run at once.");

    activeRequests++;
    try {
      let input: unknown;
      try {
        input = JSON.parse(
          (await readBody(request, operation.bodyLimit)).toString("utf8"),
        );
      } catch (cause) {
        if (cause instanceof BodyTooLargeError)
          return error(
            413,
            "BODY_TOO_LARGE",
            `Maximum request size is ${operation.bodyLimit} bytes.`,
            undefined,
            { Connection: "close" },
          );
        return error(400, "INVALID_INPUT", "Expected a JSON object.");
      }
      try {
        const result = await operation.run(
          input,
          AbortSignal.any([
            request.signal,
            AbortSignal.timeout(operationTimeout(operation.id)),
          ]),
          { artifacts, transport: "http" },
        );
        return json(200, result);
      } catch (cause) {
        const failure = operationError(cause);
        return error(
          failure.status,
          failure.code,
          failure.message,
          "details" in failure ? failure.details : undefined,
        );
      }
    } catch {
      return error(400, "INVALID_INPUT", "Request interrupted.");
    } finally {
      activeRequests--;
    }
  };

  return {
    fetch: run,
    async close() {
      if (closed) return;
      closed = true;
      try {
        await mcp.close();
      } finally {
        await artifacts.close();
      }
    },
  };
}

let deployedRuntime: ReturnType<typeof createServiceRuntime> | undefined,
  closingRuntime: Promise<void> | undefined;
export function handleServiceRequest(request: Request) {
  deployedRuntime ??= createServiceRuntime();
  return deployedRuntime.fetch(request);
}

export function closeServiceRuntime() {
  if (closingRuntime) return closingRuntime;
  const runtime = deployedRuntime;
  deployedRuntime = undefined;
  if (!runtime) return Promise.resolve();
  const closing = runtime.close().finally(() => {
    if (closingRuntime === closing) closingRuntime = undefined;
  });
  closingRuntime = closing;
  return closing;
}

async function nodeRequest(request: IncomingMessage, signal: AbortSignal) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value))
      for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  let onData: ((chunk: Buffer) => void) | undefined,
    onEnd: (() => void) | undefined,
    onError: ((cause: Error) => void) | undefined;
  const removeBodyListeners = () => {
    if (onData) request.off("data", onData);
    if (onEnd) request.off("end", onEnd);
    if (onError) request.off("error", onError);
  };
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : new ReadableStream<Uint8Array>({
          start(controller) {
            onData = (chunk) => {
              controller.enqueue(new Uint8Array(chunk));
              if ((controller.desiredSize ?? 1) <= 0) request.pause();
            };
            onEnd = () => {
              removeBodyListeners();
              controller.close();
            };
            onError = (cause) => {
              removeBodyListeners();
              controller.error(cause);
            };
            request.on("data", onData);
            request.once("end", onEnd);
            request.once("error", onError);
          },
          pull() {
            request.resume();
          },
          cancel() {
            removeBodyListeners();
            request.resume();
          },
        });
  return new Request(`http://${request.headers.host}${request.url}`, {
    method: request.method,
    headers,
    body: body,
    signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function writeNodeResponse(response: ServerResponse, result: Response) {
  response.writeHead(result.status, Object.fromEntries(result.headers));
  if (!result.body) return response.end();
  const reader = result.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!response.write(Buffer.from(value))) await once(response, "drain");
  }
  response.end();
}

/** Node adapter retained for protocol tests; deployed traffic uses TanStack server routes. */
export function createApiServer(options: { siteOrigin?: string } = {}) {
  const runtime = createServiceRuntime(options);
  const server = createServer(async (request, response) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);
    try {
      await writeNodeResponse(
        response,
        await runtime.fetch(await nodeRequest(request, controller.signal)),
      );
    } catch {
      if (!response.destroyed && !response.writableEnded)
        await writeNodeResponse(
          response,
          error(400, "INVALID_INPUT", "Request interrupted."),
        );
    } finally {
      request.off("aborted", abort);
      response.off("close", abort);
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.timeout = 10_000;
  server.maxHeadersCount = 30;
  server.once("close", () => void runtime.close());
  return server;
}
