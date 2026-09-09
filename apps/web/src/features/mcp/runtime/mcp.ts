import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { FormatterId } from "@/features/tools/code-formatters/types";
import { crcSchema } from "@/features/tools/crc-checksum/operation";
import {
  hashAuthorizedPath,
  shaDefinitions,
  shaSchemas,
} from "@/features/tools/hash-text-or-file/operation";
import { XXHASH_ALGORITHMS } from "@workspace/tools/hash/xxhash";
import {
  aesDecryptMcpInputSchema,
  aesEncryptMcpInputSchema,
} from "../../api/runtime/aes-tools";
import { archiveViewerMcpSchema } from "../../api/runtime/archive-viewer";
import { ArtifactStore } from "../../api/runtime/artifacts";
import {
  audioRecorderMcpSchema,
  runAudioRecording,
} from "../../api/runtime/audio-recorder";
import { barcodeReadMcpSchema } from "../../api/runtime/barcode-tools";
import {
  baseEncodingDefinitions,
  baseEncodingSchemas,
  runBaseEncodingPath,
} from "../../api/runtime/base-encoding";
import {
  blakeDefinitions,
  blakeSchemas,
  runBlakePath,
} from "../../api/runtime/blake";
import { cameraMcpInputSchema } from "../../api/runtime/camera";
import { certificateParseSchema } from "../../api/runtime/certificate-tools";
import { citySchema, highwaySchema } from "../../api/runtime/city-highway";
import { formatterSchemas } from "../../api/runtime/code-formatters";
import {
  csvToJsonMcpInputSchema,
  jsonToCsvMcpInputSchema,
  runCsvJson,
} from "../../api/runtime/csv-json";
import { curlConverterSchema } from "../../api/runtime/curl-converter";
import {
  decodeDataUriSchema,
  fileDataUriSchema,
} from "../../api/runtime/data-uri";
import { dockerComposeSchema } from "../../api/runtime/developer-parsers";
import {
  type GifAnimationId,
  gifAnimationSchemas,
} from "../../api/runtime/gif-animation";
import {
  type ImageFormatsId,
  imageFormatsSchemas,
} from "../../api/runtime/image-formats";
import { imageMetadataMcpInputSchema } from "../../api/runtime/image-metadata";
import {
  type ImageOptimizerId,
  imageOptimizersSchemas,
} from "../../api/runtime/image-optimizers";
import {
  paletteMcpSchema,
  runImagePalette,
} from "../../api/runtime/image-palette";
import {
  imageMcpInputSchema,
  resizeImageOperation,
} from "../../api/runtime/image-resizer";
import { webpMcpInputSchema } from "../../api/runtime/image-webp";
import { queryMcpSchema } from "../../api/runtime/json-query";
import { schemaToolInputSchema } from "../../api/runtime/json-schema-tools";
import { pbkdf2Schema, scryptSchema } from "../../api/runtime/kdf-tools";
import {
  legacyHashDefinitions,
  legacyHashSchemas,
  runLegacyHashPath,
} from "../../api/runtime/legacy-hash";
import { streamHashSchema } from "../../api/runtime/legacy-hashes";
import {
  integrityDefinitions,
  integritySchemas,
  runIntegrity,
} from "../../api/runtime/mac-integrity";
import { markdownMcpInputSchema } from "../../api/runtime/markdown-tools";
import { murmurSchema } from "../../api/runtime/murmurhash3";
import { operationError, operations } from "../../api/runtime/operations";
import {
  type PdfToolId,
  pdfEditingSchemas,
} from "../../api/runtime/pdf-editing";
import {
  type PdfFinishingId,
  pdfFinishingSchemas,
} from "../../api/runtime/pdf-finishing";
import {
  type PdfReadingId,
  pdfReadingSchemas,
} from "../../api/runtime/pdf-reading";
import { openapiSchema } from "../../api/runtime/project-config";
import { qrReadMcpSchema } from "../../api/runtime/qr-tools";
import { ripemdSchema } from "../../api/runtime/ripemd-extended";
import {
  runScreenRecording,
  screenRecorderMcpSchema,
} from "../../api/runtime/screen-recorder";
import { seoSchemas } from "../../api/runtime/seo-generators";
import { sipHashSchema } from "../../api/runtime/siphash";
import { sshFingerprintSchema } from "../../api/runtime/ssh-tools";
import {
  runStructured,
  structuredDefinitions,
  structuredMcpInputSchema,
} from "../../api/runtime/structured-formats";
import {
  svgImageMcpInputSchema,
  svgImageOperation,
} from "../../api/runtime/svg-image";
import {
  regexMcpInputSchema,
  runTextAnalysis,
  textDiffMcpInputSchema,
} from "../../api/runtime/text-analysis";
import {
  invisibleMcpInputSchema,
  morseMcpInputSchema,
  runTextUtilities,
} from "../../api/runtime/text-utilities";
import {
  runXmlJson,
  xmlJsonDefinitions,
  xmlJsonSchemas,
} from "../../api/runtime/xml-json";
import { xxHashSchemas } from "../../api/runtime/xxhash";
export function createMcpServer(
  inputRoots: readonly string[] = [],
  options: { artifacts?: ArtifactStore; remote?: boolean } = {},
) {
  const server = new McpServer({ name: "tooltab", version: "0.1.0" });
  const artifacts = options.artifacts ?? new ArtifactStore();
  const ownsArtifacts = options.artifacts === undefined;
  const transport = options.remote ? "http" : "mcp";
  const close = server.close.bind(server);
  server.close = async () => {
    try {
      await close();
    } finally {
      if (ownsArtifacts) await artifacts.close();
    }
  };
  server.registerTool(
    "tooltab_delete_artifact",
    {
      description: options.remote
        ? "Delete a temporary upload or output artifact from this ToolTab service using its returned UUID id. Does not accept paths or delete user source files. Idempotent."
        : "Delete a temporary artifact created by this MCP session using its returned UUID id. Does not accept paths or delete user source files. Idempotent.",
      inputSchema: z.strictObject({ id: z.uuid() }),
      outputSchema: z.strictObject({ removedOrAbsent: z.literal(true) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      try {
        await artifacts.remove(id);
        return {
          content: [
            {
              type: "text",
              text: "Temporary artifact removed or already absent.",
            },
          ],
          structuredContent: { removedOrAbsent: true },
        };
      } catch (cause) {
        const failure = operationError(cause);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `${failure.code}: ${failure.message}${"details" in failure ? `\n${JSON.stringify(failure.details)}` : ""}`,
            },
          ],
        };
      }
    },
  );
  for (const op of operations) {
    const isUtilityFile =
      op.id === "unicode-invisible-character-checker" ||
      op.id === "morse-code-converter";
    const isXml = xmlJsonDefinitions.some(([id]) => id === op.id);
    const isStructured = structuredDefinitions.some(([id]) => id === op.id);
    const isAnalysis =
      op.id === "text-diff" || op.id === "regex-tester-replacer";
    const isCsv =
      op.id === "csv-to-json-converter" || op.id === "json-to-csv-converter";
    const isIntegrity = integrityDefinitions.some((id) => id === op.id);
    const isLegacy = legacyHashDefinitions.some(([id]) => id === op.id);
    const isSha = shaDefinitions.some(([id]) => id === op.id);
    const isImage = op.id === "image-resizer";
    const isBaseEncoding = baseEncodingDefinitions.some(([id]) => id === op.id);
    const isBlake = blakeDefinitions.some(([id]) => id === op.id);
    const xxAlgorithm = XXHASH_ALGORITHMS.find(
      (algorithm) =>
        op.id === `xxhash-${algorithm.toLowerCase()}-hash-text-or-file`,
    );
    const inputSchema: z.ZodType<Record<string, unknown>> = options.remote
      ? op.inputSchema
      : op.id === "screen-recorder"
        ? screenRecorderMcpSchema
        : op.id === "camera"
          ? cameraMcpInputSchema
          : op.id === "audio-recorder"
            ? audioRecorderMcpSchema
            : op.id === "archive-viewer"
              ? archiveViewerMcpSchema
              : op.id === "openapi-to-typescript-converter"
                ? openapiSchema
                : op.id === "docker-run-to-compose-converter"
                  ? dockerComposeSchema
                  : Object.hasOwn(gifAnimationSchemas, op.id)
                    ? gifAnimationSchemas[op.id as GifAnimationId].path
                    : op.id === "barcode-reader"
                      ? barcodeReadMcpSchema
                      : op.id === "curl-converter"
                        ? curlConverterSchema
                        : Object.hasOwn(imageOptimizersSchemas, op.id)
                          ? imageOptimizersSchemas[op.id as ImageOptimizerId]
                              .path
                          : op.id === "certificate-public-key-parser"
                            ? certificateParseSchema
                            : op.id === "qr-code-reader"
                              ? qrReadMcpSchema
                              : Object.hasOwn(imageFormatsSchemas, op.id)
                                ? imageFormatsSchemas[op.id as ImageFormatsId]
                                    .path
                                : op.id === "ssh-public-key-fingerprint"
                                  ? sshFingerprintSchema
                                  : [
                                        "prettier-code-formatter",
                                        "sql-formatter-and-linter",
                                      ].includes(op.id)
                                    ? formatterSchemas(op.id as FormatterId).mcp
                                    : Object.hasOwn(pdfFinishingSchemas, op.id)
                                      ? pdfFinishingSchemas[
                                          op.id as PdfFinishingId
                                        ].path
                                      : op.id === "cityhash64-hash-text-or-file"
                                        ? citySchema
                                        : op.id ===
                                            "highwayhash-hash-text-or-file"
                                          ? highwaySchema
                                          : [
                                                "robots-txt-generator",
                                                "sitemap-xml-generator",
                                              ].includes(op.id)
                                            ? seoSchemas(op.id).mcp
                                            : Object.hasOwn(
                                                  pdfReadingSchemas,
                                                  op.id,
                                                )
                                              ? pdfReadingSchemas[
                                                  op.id as PdfReadingId
                                                ].path
                                              : [
                                                    "siphash-2-4-hash-text-or-file",
                                                    "siphash-128-2-4-hash-text-or-file",
                                                  ].includes(op.id)
                                                ? sipHashSchema
                                                : [
                                                      "ripemd128-hash-text-or-file",
                                                      "ripemd256-hash-text-or-file",
                                                      "ripemd320-hash-text-or-file",
                                                    ].includes(op.id)
                                                  ? ripemdSchema
                                                  : Object.hasOwn(
                                                        pdfEditingSchemas,
                                                        op.id,
                                                      )
                                                    ? pdfEditingSchemas[
                                                        op.id as PdfToolId
                                                      ].path
                                                    : [
                                                          "markdown-previewer",
                                                          "markdown-to-html-converter",
                                                          "html-to-markdown-converter",
                                                        ].includes(op.id)
                                                      ? markdownMcpInputSchema
                                                      : op.id.startsWith(
                                                            "murmurhash3-",
                                                          )
                                                        ? murmurSchema
                                                        : op.id ===
                                                            "crc-checksum-calculator"
                                                          ? crcSchema
                                                          : [
                                                                "exif-viewer",
                                                                "image-metadata-cleaner",
                                                              ].includes(op.id)
                                                            ? imageMetadataMcpInputSchema
                                                            : xxAlgorithm
                                                              ? xxHashSchemas(
                                                                  xxAlgorithm,
                                                                ).input
                                                              : [
                                                                    "markdown-previewer",
                                                                    "markdown-to-html-converter",
                                                                    "html-to-markdown-converter",
                                                                    "pdf-merger",
                                                                    "pdf-splitter",
                                                                    "pdf-page-organizer",
                                                                    "pdf-page-number-adder",
                                                                    "pdf-info-viewer",
                                                                    "pdf-text-extractor",
                                                                    "pdf-to-image-converter",
                                                                    "robots-txt-generator",
                                                                    "sitemap-xml-generator",
                                                                    "json-diff-path",
                                                                    "json-schema-generator",
                                                                    "json-schema-validator",
                                                                  ].includes(
                                                                    op.id,
                                                                  )
                                                                ? schemaToolInputSchema(
                                                                    op.id,
                                                                    true,
                                                                  )
                                                                : [
                                                                      "md4-hash-text-or-file",
                                                                      "sm3-hash-text-or-file",
                                                                      "whirlpool-hash-text-or-file",
                                                                    ].includes(
                                                                      op.id,
                                                                    )
                                                                  ? streamHashSchema
                                                                  : op.id ===
                                                                      "aes-encryptor"
                                                                    ? aesEncryptMcpInputSchema
                                                                    : op.id ===
                                                                        "aes-decryptor"
                                                                      ? aesDecryptMcpInputSchema
                                                                      : [
                                                                            "jsonpath-tester",
                                                                            "jmespath-tester",
                                                                          ].includes(
                                                                            op.id,
                                                                          )
                                                                        ? queryMcpSchema
                                                                        : op.id ===
                                                                            "pbkdf2-key-derivation"
                                                                          ? pbkdf2Schema
                                                                          : op.id ===
                                                                              "scrypt-key-derivation"
                                                                            ? scryptSchema
                                                                            : isUtilityFile
                                                                              ? op.id ===
                                                                                "morse-code-converter"
                                                                                ? morseMcpInputSchema
                                                                                : invisibleMcpInputSchema
                                                                              : isXml
                                                                                ? xmlJsonSchemas(
                                                                                    op.id,
                                                                                  )
                                                                                    .mcp
                                                                                : op.id ===
                                                                                    "file-to-data-uri-converter"
                                                                                  ? fileDataUriSchema
                                                                                  : op.id ===
                                                                                      "data-uri-to-file-converter"
                                                                                    ? decodeDataUriSchema
                                                                                    : isStructured
                                                                                      ? structuredMcpInputSchema
                                                                                      : isAnalysis
                                                                                        ? op.id ===
                                                                                          "text-diff"
                                                                                          ? textDiffMcpInputSchema
                                                                                          : regexMcpInputSchema
                                                                                        : isCsv
                                                                                          ? op.id ===
                                                                                            "csv-to-json-converter"
                                                                                            ? csvToJsonMcpInputSchema
                                                                                            : jsonToCsvMcpInputSchema
                                                                                          : isIntegrity
                                                                                            ? integritySchemas(
                                                                                                op.id,
                                                                                              )
                                                                                                .mcp
                                                                                            : op.id ===
                                                                                                "svg-to-image"
                                                                                              ? svgImageMcpInputSchema
                                                                                              : isLegacy
                                                                                                ? legacyHashSchemas(
                                                                                                    op.id,
                                                                                                  )
                                                                                                    .mcp
                                                                                                : op.id ===
                                                                                                    "palette-extractor"
                                                                                                  ? paletteMcpSchema
                                                                                                  : op.id ===
                                                                                                      "image-to-webp"
                                                                                                    ? webpMcpInputSchema
                                                                                                    : isBaseEncoding
                                                                                                      ? baseEncodingSchemas(
                                                                                                          op.id,
                                                                                                        )
                                                                                                          .mcp
                                                                                                      : isBlake
                                                                                                        ? blakeSchemas(
                                                                                                            op.id,
                                                                                                          )
                                                                                                            .mcp
                                                                                                        : isImage
                                                                                                          ? imageMcpInputSchema
                                                                                                          : isSha
                                                                                                            ? shaSchemas(
                                                                                                                op.id,
                                                                                                              )
                                                                                                                .mcp
                                                                                                            : op.inputSchema;
    server.registerTool(
      op.name,
      {
        description: options.remote
          ? `${op.description.replaceAll("MCP file paths require authorized roots.", "")} Remote MCP does not accept server filesystem paths.`
          : isSha ||
              isBlake ||
              isLegacy ||
              isIntegrity ||
              isCsv ||
              isUtilityFile ||
              isXml ||
              isStructured ||
              isAnalysis
            ? `${op.description.replace("No file path access.", "")} MCP also accepts inputPath within startup-authorized --input-root directories; no authorized roots means file access is denied.`
            : isImage
              ? `${op.description} MCP may instead read inputPath within a configured --input-root.`
              : op.description,
        inputSchema,
        outputSchema: op.outputSchema,
        annotations: {
          readOnlyHint: ![
            "gif-to-animated-webp-converter",
            "gif-to-apng-converter",
            "docker-run-to-compose-converter",
            "curl-converter",
            "png-optimizer",
            "svg-optimizer",
            "image-to-avif-converter",
            "image-to-ico",
            "prettier-code-formatter",
            "sql-formatter-and-linter",
            "image-to-pdf-converter",
            "remove-pdf-owner-password",
            "markdown-previewer",
            "markdown-to-html-converter",
            "html-to-markdown-converter",
            "pdf-merger",
            "pdf-splitter",
            "pdf-page-organizer",
            "pdf-page-number-adder",
            "pdf-info-viewer",
            "pdf-text-extractor",
            "pdf-to-image-converter",
            "robots-txt-generator",
            "sitemap-xml-generator",
            "json-diff-path",
            "exif-viewer",
            "image-metadata-cleaner",
            "json-schema-generator",
            "json-schema-validator",
            "random-password-generator",
            "aes-encryptor",
            "aes-decryptor",
            "jsonpath-tester",
            "jmespath-tester",
            "unicode-invisible-character-checker",
            "morse-code-converter",
            "lorem-ipsum-generator",
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
            "image-to-webp",
            "css-gradient-generator",
            "list-comparer",
            "slug-generator",
          ].includes(op.id),
          destructiveHint: false,
          idempotentHint: op.idempotent,
          openWorldHint: false,
        },
      },
      async (input, context) => {
        try {
          const data = isUtilityFile
            ? await runTextUtilities(
                op.id,
                input,
                context.mcpReq.signal,
                inputRoots,
                { artifacts, transport, inputRoots },
              )
            : isXml
              ? await runXmlJson(
                  op.id,
                  input,
                  context.mcpReq.signal,
                  inputRoots,
                  { artifacts, transport, inputRoots },
                )
              : isStructured
                ? await runStructured(
                    op.id,
                    input,
                    context.mcpReq.signal,
                    inputRoots,
                    { artifacts, transport, inputRoots },
                  )
                : isAnalysis
                  ? await runTextAnalysis(
                      op.id,
                      input,
                      context.mcpReq.signal,
                      inputRoots,
                      { artifacts, transport, inputRoots },
                    )
                  : isCsv
                    ? await runCsvJson(
                        op.id,
                        input,
                        context.mcpReq.signal,
                        inputRoots,
                        { artifacts, transport, inputRoots },
                      )
                    : isIntegrity
                      ? await runIntegrity(
                          op.id,
                          input,
                          context.mcpReq.signal,
                          inputRoots,
                        )
                      : op.id === "svg-to-image"
                        ? await svgImageOperation(
                            input,
                            context.mcpReq.signal,
                            inputRoots,
                          )
                        : isLegacy && "inputPath" in input
                          ? await runLegacyHashPath(
                              op.id,
                              input,
                              inputRoots,
                              context.mcpReq.signal,
                            )
                          : op.id === "palette-extractor"
                            ? await runImagePalette(
                                input,
                                context.mcpReq.signal,
                                inputRoots,
                              )
                            : isImage
                              ? await resizeImageOperation(
                                  input,
                                  context.mcpReq.signal,
                                  inputRoots,
                                )
                              : isBaseEncoding && "inputPath" in input
                                ? await runBaseEncodingPath(
                                    op.id,
                                    input,
                                    inputRoots,
                                    context.mcpReq.signal,
                                  )
                                : isBlake && "inputPath" in input
                                  ? await runBlakePath(
                                      op.id,
                                      input,
                                      inputRoots,
                                      context.mcpReq.signal,
                                    )
                                  : isSha && "inputPath" in input
                                    ? await hashAuthorizedPath(
                                        op.id,
                                        input,
                                        inputRoots,
                                        context.mcpReq.signal,
                                      )
                                    : op.id === "screen-recorder"
                                      ? await runScreenRecording(
                                          input,
                                          context.mcpReq.signal,
                                          inputRoots,
                                          { artifacts, transport, inputRoots },
                                        )
                                      : op.id === "audio-recorder"
                                        ? await runAudioRecording(
                                            input,
                                            context.mcpReq.signal,
                                            inputRoots,
                                            {
                                              artifacts,
                                              transport,
                                              inputRoots,
                                            },
                                          )
                                        : await op.run(
                                            input,
                                            context.mcpReq.signal,
                                            {
                                              artifacts,
                                              transport,
                                              inputRoots,
                                            },
                                          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  op.id === "css-gradient-generator" && "raster" in data
                    ? {
                        ...data,
                        raster: {
                          ...(data.raster as Record<string, unknown>),
                          output:
                            "Image bytes are in structuredContent.raster.output.",
                        },
                      }
                    : op.id === "image-to-webp"
                      ? {
                          ...data,
                          results: (
                            (data as Record<string, unknown>).results as Array<
                              Record<string, unknown>
                            >
                          ).map((item) =>
                            item.output
                              ? {
                                  ...item,
                                  output: "Base64 in structuredContent.results",
                                }
                              : item,
                          ),
                        }
                      : isImage ||
                          op.id === "placeholder-generator" ||
                          op.id === "svg-to-image"
                        ? {
                            ...data,
                            output:
                              "Encoded image bytes are available in structuredContent.output (Base64).",
                          }
                        : data,
                ),
              },
            ],
            structuredContent: data,
          };
        } catch (cause) {
          const failure = operationError(cause);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `${failure.code}: ${failure.message}${"details" in failure ? `\n${JSON.stringify(failure.details)}` : ""}`,
              },
            ],
          };
        }
      },
    );
  }
  return server;
}
