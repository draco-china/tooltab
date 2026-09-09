import * as z from "zod/v4";
import { TARGET_IDS } from "@workspace/tools/network/curl-contract";
import {
  CurlToolError,
  MAX_CURL_INPUT,
} from "@workspace/tools/network/curl-contract";
import { runCurl } from "@/features/tools/curl-converter/worker-client";
import { resolveSource } from "./legacy-hashes";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const options = {
  target: z.enum(TARGET_IDS).default("javascript-fetch"),
  delivery: z.enum(["inline", "artifact"]).default("inline"),
};
const text = z.strictObject({
    ...options,
    input: z.string().max(MAX_CURL_INPUT),
  }),
  upload = z.strictObject({ ...options, uploadId: z.uuid() });
export const curlConverterSchema = z.union([
  text,
  upload,
  z.strictObject({ ...options, inputPath: z.string().min(1).max(4096) }),
]);
export const curlConverterHttpSchema = z.union([text, upload]);
const warning = z.strictObject({ code: z.string(), message: z.string() });
const inline = z.strictObject({
  output: z.string(),
  warnings: z.array(warning),
  error: z.string().nullable(),
  filename: z.string(),
});
const artifact = z.strictObject({
  mode: z.literal("artifact"),
  characters: z.number().int(),
  warningCount: z.number().int(),
  error: z.string().nullable(),
  artifacts: z.array(
    z.strictObject({
      id: z.string(),
      bytes: z.number(),
      mimeType: z.string(),
      filename: z.string(),
      expiresAt: z.number(),
      path: z.string().optional(),
      downloadUrl: z.string().optional(),
    }),
  ),
});
let active = 0;
export const curlConverterOperation: Operation = {
  id: "curl-converter",
  name: "tooltab_curl_converter",
  description:
    "Parse cURL as text and generate code for all47 supported targets; never executes commands, reads embedded file references, expands environment variables or sends requests. Returns full standard converter warnings. UTF8 command input/upload/authorized MCP path up to8MiB. Inline JSON capped256KiB; explicit delivery artifact returns complete code and diagnostic JSON files, which may contain credentials from input.",
  inputSchema: curlConverterSchema,
  outputSchema: z.union([inline, artifact]),
  bodyLimit: 51000000,
  idempotent: false,
  async run(value, signal, context) {
    const p = curlConverterSchema.parse(value),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    if (active >= 2) throw new CurlToolError("busy");
    active++;
    const saved: string[] = [];
    try {
      let input: string;
      if ("input" in p) input = p.input;
      else {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        const pieces: string[] = [];
        try {
          for await (const chunk of resolveSource(
            "uploadId" in p
              ? { uploadId: p.uploadId }
              : { inputPath: p.inputPath },
            abort,
            context,
          )) {
            bytes += chunk.length;
            if (bytes > MAX_CURL_INPUT) throw new CurlToolError("too_large");
            pieces.push(decoder.decode(chunk, { stream: true }));
          }
          pieces.push(decoder.decode());
          input = pieces.join("");
        } catch (e) {
          if (e instanceof TypeError)
            throw new CurlToolError("invalid_unicode");
          throw e;
        }
      }
      const result = await runCurl(
        { input, target: p.target },
        abort,
        () =>
          new Worker(serviceWorkerUrl("curl-worker", import.meta.url), {
            type: "module",
          }),
      );
      const value = {
        output: result.output,
        warnings: result.warnings,
        error: result.error,
        filename: result.filename,
      };
      if (
        p.delivery === "inline" &&
        result.output.length +
          result.warnings.reduce(
            (n, w) => n + w.code.length + w.message.length,
            0,
          ) +
          (result.error?.length ?? 0) >
          262144
      )
        throw new CurlToolError("artifact_required");
      const json = JSON.stringify(value);
      abort.throwIfAborted();
      if (p.delivery === "inline") {
        if (new TextEncoder().encode(json).length > 262144)
          throw new CurlToolError("artifact_required");
        return value;
      }
      if (!context) throw new CurlToolError("artifact_required");
      const artifacts = [];
      for (const file of [
        {
          name: result.filename,
          mime: "text/plain;charset=utf-8",
          text: result.output,
        },
        { name: "conversion.json", mime: "application/json", text: json },
      ]) {
        async function* source() {
          let cursor = 0;
          while (cursor < file.text.length) {
            abort.throwIfAborted();
            let end = Math.min(file.text.length, cursor + 65536);
            if (
              end < file.text.length &&
              file.text.charCodeAt(end - 1) >= 0xd800 &&
              file.text.charCodeAt(end - 1) <= 0xdbff
            )
              end--;
            yield new TextEncoder().encode(file.text.slice(cursor, end));
            cursor = end;
          }
        }
        const record = await context.artifacts.write(
          source(),
          {
            filename: file.name,
            mimeType: file.mime,
            limit: 256 * 1024 * 1024,
          },
          abort,
        );
        saved.push(record.id);
        const { id, bytes, mimeType, filename, expiresAt } = record;
        artifacts.push({
          id,
          bytes,
          mimeType,
          filename,
          expiresAt,
          ...(context.transport === "mcp"
            ? { path: record.path }
            : { downloadUrl: `/api/v1/artifacts/${id}` }),
        });
      }
      abort.throwIfAborted();
      return {
        mode: "artifact" as const,
        characters: result.output.length,
        warningCount: result.warnings.length,
        error: result.error?.slice(0, 1000) ?? null,
        artifacts,
      };
    } catch (e) {
      if (context)
        await Promise.allSettled(
          saved.map((id) => context.artifacts.remove(id)),
        );
      throw e;
    } finally {
      active--;
    }
  },
};
