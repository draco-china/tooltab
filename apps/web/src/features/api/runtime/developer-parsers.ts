import * as z from "zod/v4";
import { DeveloperParserError } from "@/features/tools/_shared/developer-parser-error";
import { runDocker } from "@/features/tools/developer-parsers/client";
import { MAX_DOCKER_INPUT } from "@workspace/tools/project/docker";
import {
  MAX_UA_LENGTH,
  parseUserAgent,
} from "@workspace/tools/network/user-agent";
import { resolveSource } from "./legacy-hashes";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const options = {
  delivery: z.enum(["inline", "artifact"]).default("inline"),
};
const text = z.strictObject({
    ...options,
    input: z.string().max(MAX_DOCKER_INPUT),
  }),
  upload = z.strictObject({ ...options, uploadId: z.uuid() });
export const dockerComposeSchema = z.union([
  text,
  upload,
  z.strictObject({ ...options, inputPath: z.string().min(1).max(4096) }),
]);
export const dockerComposeHttpSchema = z.union([text, upload]);
const inline = z.strictObject({
  output: z.string(),
  warnings: z.array(z.string()),
  error: z.string().nullable(),
  serviceCount: z.number().int(),
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
export const dockerComposeOperation: Operation = {
  id: "docker-run-to-compose-converter",
  name: "tooltab_docker_run_to_compose_converter",
  description:
    "Parse Docker run command text to Compose YAML locally without executing shell/Docker, reading referenced files or expanding variables. All audited run options and multiple services. Source input/upload/authorized MCP path up to 8 MiB UTF-8; inline JSON up to 256 KiB, explicit delivery artifact preserves full YAML and warnings. Generated configuration may contain input secrets.",
  inputSchema: dockerComposeSchema,
  outputSchema: z.union([inline, artifact]),
  bodyLimit: 51000000,
  idempotent: false,
  async run(value, signal, context) {
    const p = dockerComposeSchema.parse(value),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    if (active >= 2) throw new DeveloperParserError("busy");
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
            if (bytes > MAX_DOCKER_INPUT)
              throw new DeveloperParserError("too_large");
            pieces.push(decoder.decode(chunk, { stream: true }));
          }
          pieces.push(decoder.decode());
          input = pieces.join("");
        } catch (e) {
          if (e instanceof TypeError)
            throw new DeveloperParserError("invalid_unicode");
          throw e;
        }
      }
      const result = await runDocker(
        input,
        abort,
        () =>
          new Worker(
            serviceWorkerUrl("docker-parser-worker", import.meta.url),
            {
              type: "module",
            },
          ),
      );
      const value = result;
      if (
        p.delivery === "inline" &&
        result.output.length +
          result.warnings.reduce((n, w) => n + w.length, 0) +
          (result.error?.length ?? 0) >
          262144
      )
        throw new DeveloperParserError("artifact_required");
      const json = JSON.stringify(value);
      abort.throwIfAborted();
      if (p.delivery === "inline") {
        if (new TextEncoder().encode(json).length > 262144)
          throw new DeveloperParserError("artifact_required");
        return value;
      }
      if (!context) throw new DeveloperParserError("artifact_required");
      const artifacts = [];
      for (const file of [
        {
          name: "docker-compose.yml",
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

const optionalText = z.string().nullable();
export const userAgentSchema = z.strictObject({
  input: z.string().max(MAX_UA_LENGTH),
});
export const userAgentOperation: Operation = {
  id: "user-agent-parser",
  name: "tooltab_user_agent_parser",
  description:
    "Parse a supplied User-Agent string locally into browser, OS, engine, device and CPU details. Heuristic string analysis only, not verified device identity; no network or Client Hints. Unknown fields are null. Maximum 500 characters; longer input is rejected without silent truncation.",
  inputSchema: userAgentSchema,
  outputSchema: z.strictObject({
    result: z
      .strictObject({
        ua: z.string(),
        browser: z.strictObject({
          name: optionalText,
          version: optionalText,
          major: optionalText,
        }),
        os: z.strictObject({ name: optionalText, version: optionalText }),
        engine: z.strictObject({ name: optionalText, version: optionalText }),
        device: z.strictObject({
          type: optionalText,
          vendor: optionalText,
          model: optionalText,
        }),
        cpu: z.strictObject({ architecture: optionalText }),
      })
      .nullable(),
  }),
  bodyLimit: 4096,
  idempotent: true,
  run(value, signal) {
    signal?.throwIfAborted();
    return { result: parseUserAgent(userAgentSchema.parse(value).input) };
  },
};
