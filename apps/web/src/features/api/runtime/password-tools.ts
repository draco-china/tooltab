import * as z from "zod/v4";
import {
  generatorDefaults,
  MAX_PASSWORD_OUTPUT,
  PasswordToolError,
} from "@workspace/tools/password/generator";
import { MAX_STRENGTH_LENGTH } from "@workspace/tools/password/strength";
import { runPasswordWorker } from "@/features/tools/password-tools/worker-client";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const size = z.number().int().min(1).max(MAX_PASSWORD_OUTPUT);
export const passwordGeneratorInputSchema = z.strictObject({
  mode: z.enum(["random", "words", "separator", "pin"]).default("random"),
  length: size.optional(),
  charsets: z
    .array(z.enum(["upper", "lower", "digits", "symbols"]))
    .max(4)
    .default([...generatorDefaults.charsets]),
  excludeSimilar: z.boolean().default(true),
  wordCount: size.default(4),
  separator: z.string().max(16384).default("-"),
  capitalize: z.boolean().default(false),
  includeNumber: z.boolean().default(false),
  blockLength: size.default(3),
  blockCount: size.default(3),
  blockSeparator: z.string().max(16384).default("-"),
  allowLeadingZero: z.boolean().default(true),
  delivery: z.enum(["inline", "artifact"]).default("inline"),
});
export const passwordStrengthInputSchema = z.strictObject({
  password: z.string().min(1).max(MAX_STRENGTH_LENGTH),
  locale: z.enum(["en-US", "zh-CN"]).default("en-US"),
});
const generated = z.strictObject({
  kind: z.literal("generated"),
  mode: z.enum(["random", "words", "separator", "pin"]),
  bytes: z.number().int(),
  samplingEntropyBits: z.number(),
});
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
export const passwordGeneratorOutputSchema = z.union([
  generated.extend({ delivery: z.literal("inline"), output: z.string() }),
  generated.extend({ delivery: z.literal("artifact"), artifact }),
]);
export const passwordStrengthOutputSchema = z.strictObject({
  kind: z.literal("strength"),
  model: z.string(),
  dictionaries: z.array(z.string()),
  locale: z.enum(["en-US", "zh-CN"]),
  length: z.number().int(),
  utf16Length: z.number().int(),
  uniqueCount: z.number().int(),
  composition: z.strictObject({
    lower: z.number().int(),
    upper: z.number().int(),
    digit: z.number().int(),
    other: z.number().int(),
  }),
  score: z.number().int().min(0).max(4),
  log10Guesses: z.number().nullable(),
  estimatedGuessBits: z.number().nullable(),
  numericOverflow: z.boolean(),
  warning: z.string().nullable(),
  suggestions: z.array(z.string()),
  crackSeconds: z.strictObject({
    offline1e10: z.number().nullable(),
    online100: z.number().nullable(),
  }),
});
let active = false;
export async function runPasswordTool(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new PasswordToolError("busy");
  active = true;
  let saved: string | undefined;
  try {
    if (id === "password-strength-checker") {
      const p = passwordStrengthInputSchema.parse(input);
      return await runPasswordWorker(
        { kind: "check", ...p },
        signal,
        undefined,
        import.meta.env.PROD
          ? () =>
              new Worker(
                serviceWorkerUrl("password-tools-worker", import.meta.url),
                { type: "module" },
              )
          : undefined,
      );
    }
    if (id !== "random-password-generator")
      throw new PasswordToolError("invalid_options");
    const { delivery, ...p } = passwordGeneratorInputSchema.parse(input);
    if (delivery === "artifact" && !context)
      throw new PasswordToolError("artifact_required");
    const result = await runPasswordWorker(
      {
        kind: "generate",
        options: { ...p, length: p.length ?? (p.mode === "pin" ? 6 : 16) },
      },
      signal,
      undefined,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("password-tools-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    );
    if (result.kind !== "generated")
      throw new PasswordToolError("invalid_input");
    signal?.throwIfAborted();
    if (delivery === "inline") {
      if (result.bytes > 16384)
        throw new PasswordToolError("artifact_required");
      return { ...result, delivery };
    }
    if (!context) throw new PasswordToolError("artifact_required");
    const bytes = new TextEncoder().encode(result.output);
    const record = await context.artifacts.write(
      (async function* () {
        yield bytes;
      })(),
      {
        limit: MAX_PASSWORD_OUTPUT,
        mimeType: "text/plain;charset=utf-8",
        filename: "generated-password.txt",
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    const { output, ...summary } = result;
    const {
      id: artifactId,
      bytes: byteCount,
      mimeType,
      filename,
      expiresAt,
    } = record;
    return {
      ...summary,
      delivery,
      artifact: {
        id: artifactId,
        bytes: byteCount,
        mimeType,
        filename,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${artifactId}` }),
      },
    };
  } catch (e) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw e;
  } finally {
    active = false;
  }
}
export const passwordOperations: Operation[] = [
  {
    id: "random-password-generator",
    name: "tooltab_random_password_generator",
    description:
      "Generate a real local WebCrypto password, BIP39-word passphrase (not a wallet mnemonic), grouped code or PIN with unbiased sampling. Full upstream options; 1 MiB output cap, 16 KiB inline. Larger output requires explicit delivery artifact; no automatic secret storage. Empty selected character list falls back to upper/lower/digits; empty separators become a hyphen.",
    inputSchema: passwordGeneratorInputSchema,
    outputSchema: passwordGeneratorOutputSchema,
    bodyLimit: 220000,
    idempotent: false,
    run(input, signal, context) {
      return runPasswordTool(
        "random-password-generator",
        input,
        signal,
        context,
      );
    },
  },
  {
    id: "password-strength-checker",
    name: "tooltab_password_strength_checker",
    description:
      "Estimate guessing difficulty locally using zxcvbn-ts 4.2.0 with common, English and Simplified Chinese dictionaries and keyboard graphs. Complete input up to 1024 UTF-16 units, cancellable 15-second Worker. Feedback is an estimate, not a guarantee or breach lookup. Password and matched substrings are not returned or persisted; do not place real passwords in shared logs or examples.",
    inputSchema: passwordStrengthInputSchema,
    outputSchema: passwordStrengthOutputSchema,
    bodyLimit: 7000,
    idempotent: true,
    run(input, signal, context) {
      return runPasswordTool(
        "password-strength-checker",
        input,
        signal,
        context,
      );
    },
  },
];
