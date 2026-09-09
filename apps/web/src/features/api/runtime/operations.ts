import { ShaHashError } from "@workspace/tools/hash/sha-input";
import { UserAgentError } from "@workspace/tools/network/user-agent";
import { IdentityError as EmailError } from "@workspace/tools/validation/email";
import { HttpTextError as CookieError } from "@workspace/tools/network/cookie";
import { DateToolError as BusinessDaysError } from "@workspace/tools/time/business-days";
import { RotCipherError } from "@workspace/tools/encoding/rot";
import { TextCodecError as UnicodeCodecError } from "@workspace/tools/encoding/unicode";
import * as z from "zod/v4";
import { addressToolOperations } from "@/features/tools/address-tools/operation";
import { chmodOperation } from "./permissions";
import { cidrToolOperations } from "@/features/tools/cidr-tools/operation";
import { colorToolOperations } from "@/features/tools/color-tools/operation";
import {
  crcHttpSchema,
  crcOperation,
} from "@/features/tools/crc-checksum/operation";
import { cronToolOperations } from "./cron-tools";
import { deviceInformationOperation } from "@/features/tools/device-information/operation";
import { namedColorsOperation } from "@/features/tools/html-color-names/operation";
import { ksuidOperation } from "./ksuid";
import { numberConverterOperations } from "@/features/tools/number-converter/operation";
import { randomNumberOperation } from "./random-number";
import { referenceOperations } from "@/features/tools/reference-lookups/operation";
import { stopwatchOperation } from "./stopwatch";
import { timerOperation } from "@/features/tools/timer/operation";
import { uuidOperations } from "@/features/tools/uuid-generator/operation";
import { uuidInspectorOperations } from "@/features/tools/uuid-inspector/operation";
import { uuidNameOperations } from "@/features/tools/uuid-name/operation";
import { uuidTimeOperations } from "@/features/tools/uuid-time/operation";
import type { Operation, OperationContext } from "./operation-contract";

export type { Operation } from "./operation-contract";

import { DeveloperParserError } from "@/features/tools/_shared/developer-parser-error";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import { StreamHashError } from "@workspace/tools/hash/input";
import { MurmurSeedError } from "@workspace/tools/hash/murmur";
import { AddressError } from "@workspace/tools/network/address";
import { AesToolError } from "@workspace/tools/crypto/aes";
import { ArchiveError } from "@workspace/tools/archive";
import { ArgonError } from "@workspace/tools/crypto/argon2";
import { AsciiError } from "@workspace/tools/text/ascii";
import { BarcodeError } from "@workspace/tools/encoding/barcode-contract";
import { BaseEncodingError } from "@workspace/tools/encoding/base";
import {
  Base64Error,
  decodeBase64Text,
  encodeBase64Text,
  MAX_BASE64_INPUT_CHARACTERS,
} from "@workspace/tools/encoding/base64";
import { BcryptError } from "@workspace/tools/crypto/bcrypt";
import { MnemonicError } from "@workspace/tools/crypto/mnemonic";
import { BlakeHashError } from "@workspace/tools/hash/blake";
import {
  CaseConversionError,
  caseStyles,
  convertTextCases,
  MAX_CASE_INPUT,
} from "@workspace/tools/text/case";
import { CertificateToolError } from "@workspace/tools/crypto/certificate-contract";
import { CidrError } from "@workspace/tools/network/cidr";
import { CitySeedError } from "@workspace/tools/hash/city";
import { HighwayKeyError } from "@workspace/tools/hash/highway";
import { FormatterError } from "@workspace/tools/format/contract";
import type { FormatterId } from "@/features/tools/code-formatters/types";
import { CodeScreenshotError } from "@workspace/tools/image/code-screenshot";
import { ColorError } from "@workspace/tools/color/convert";
import { CronToolError } from "@workspace/tools/time/cron";
import { CssGeneratorError } from "@workspace/tools/css/generators";
import { CsvJsonError } from "@workspace/tools/encoding/csv-json";
import { ShortIdError as Cuid2ShortIdError } from "@workspace/tools/id/cuid2";
import { CurlToolError } from "@workspace/tools/network/curl-contract";
import { DataUriError } from "@workspace/tools/encoding/data-uri";
import { DateToolError } from "@workspace/tools/time/date-time";
import { AnimationError } from "@workspace/tools/image/gif-contract";

import {
  HashBytesEncodingError,
  MAX_HASH_BASE64,
  shaOperations,
} from "@/features/tools/hash-text-or-file/operation";
import {
  BasicAuthGeneratorError,
  BasicAuthDecoderError,
} from "@workspace/tools/encoding/basic-auth";
import { IcalError } from "@workspace/tools/time/ical-contract";
import { ImageFormatError } from "@workspace/tools/image";
import { ImageMetadataError } from "@workspace/tools/image/metadata-containers";
import { OptimizerError } from "@workspace/tools/image/optimizer";
import { JoseToolError } from "@workspace/tools/crypto/jose-common";
import { SchemaToolError } from "@workspace/tools/json/schema-contract";
import {
  formatJson,
  JsonFormatError,
  MAX_JSON_LENGTH,
} from "@workspace/tools/json";
import { QueryError } from "@workspace/tools/json/value";
import { KdfError } from "@workspace/tools/crypto/kdf";
import { KsuidError } from "@workspace/tools/id/ksuid";
import { ListSlugError } from "@workspace/tools/text/lists";
import { IntegrityError } from "@workspace/tools/hash/integrity";
import { MarkdownError } from "@workspace/tools/text/markdown-contract";
import { NumberConversionError } from "@workspace/tools/number/chinese-amount";
import { NumberBaseConversionError } from "@workspace/tools/number/base";
import { RomanNumeralConversionError } from "@workspace/tools/number/roman";
import { ProjectConfigError } from "@workspace/tools/project/openapi-contract";
import { PasswordToolError } from "@workspace/tools/password/generator";
import { PgpToolError } from "@workspace/tools/crypto/pgp-contract";
import { IdentityError } from "@workspace/tools/validation/prc-id";
import { QrError } from "@workspace/tools/encoding/qr-contract";
import { RandomNumberError } from "@workspace/tools/number/random";
import { LookupError } from "@/features/tools/reference-lookups/logic";
import { SeoError } from "@workspace/tools/project/seo";
import { ShortIdError as NanoIdShortIdError } from "@workspace/tools/id/nanoid";
import { SipHashKeyError } from "@workspace/tools/hash/siphash";
import { SshError } from "@workspace/tools/crypto/ssh";
import { StructuredError } from "@workspace/tools/encoding/structured";
import { TextAnalysisError } from "@workspace/tools/text/analysis";
import { TextCodecError } from "@workspace/tools/encoding/html";
import {
  analyzeText,
  MAX_STATISTICS_LENGTH,
  TextStatisticsError,
} from "@workspace/tools/text/statistics";
import { TextUtilityError } from "@/features/tools/text-utilities/logic";
import { ShortIdError as UlidShortIdError } from "@workspace/tools/id/ulid";
import { unitConverterOperation } from "@/features/tools/unit-converter/operation";
import { TimestampError } from "@workspace/tools/time/timestamp";
import {
  MAX_URL_INPUT,
  transformUrl,
  UrlCodecError,
} from "@workspace/tools/encoding/url";
import {
  UuidGenerationError,
  UuidV7Error,
} from "@workspace/tools/uuid/generate";
import { UuidInspectionError } from "@workspace/tools/uuid/inspect";
import { UuidNameError } from "@workspace/tools/uuid/name";
import { UuidTimeError } from "@workspace/tools/uuid/time";
import { XmlJsonError } from "@workspace/tools/encoding/xml-json";
import {
  XXHASH_ALGORITHMS,
  XxHashSeedError,
} from "@workspace/tools/hash/xxhash";
import { automationToolNames } from "@/lib/automation-catalog";
import { aesOperations, runAesTool } from "./aes-tools";
import { archiveViewerOperation } from "./archive-viewer";
import { argonToolOperations } from "./argon2-tools";
import { ArtifactError } from "./artifacts";
import { asciiArtOperation } from "./ascii-art";
import {
  AudioRecorderServiceError,
  audioRecorderOperation,
} from "./audio-recorder";
import { barcodeOperations } from "./barcode-tools";
import {
  baseEncodingDefinitions,
  baseEncodingOutputSchema,
  baseEncodingSchemas,
  runBaseEncoding,
} from "./base-encoding";
import { bcryptToolOperations } from "./bcrypt-tools";
import { mnemonicOperation } from "./bip39-mnemonic";
import {
  blakeDefinitions,
  blakeOutputSchema,
  blakeSchemas,
  runBlake,
} from "./blake";
import { CameraServiceError, cameraOperation } from "./camera";
import {
  certificateOperations,
  certificateParseHttpSchema,
} from "./certificate-tools";
import {
  checksumDefinitions,
  checksumInputSchema,
  checksumOutputSchema,
  runChecksumValidation,
} from "./checksum-validators";
import {
  cityHighwayOperations,
  cityHttpSchema,
  highwayHttpSchema,
} from "./city-highway";
import { formatterOperations, runFormatterTool } from "./code-formatters";
import { codeScreenshotOperation } from "./code-screenshot-generator";
import { colorPickerOperation } from "./color-picker";
import { ColorPickerError } from "@workspace/tools/color/picker";
import { cssGeneratorOperations } from "./css-generators";
import { csvJsonOperations } from "./csv-json";
import {
  curlConverterHttpSchema,
  curlConverterOperation,
} from "./curl-converter";
import {
  CurrentNetworkTimeError,
  currentNetworkTimeOperation,
} from "./current-network-time";
import { dataUriOperations } from "./data-uri";
import { dateToolOperations } from "./date-tools";
import {
  dockerComposeHttpSchema,
  dockerComposeOperation,
  userAgentOperation,
} from "./developer-parsers";
import {
  FaviconAssetsError,
  faviconAssetsOperation,
} from "./favicon-assets-generator";
import { FileAccessError } from "./files";
import {
  type GifAnimationId,
  gifAnimationOperations,
  runGifAnimationTool,
} from "./gif-animation";
import { httpTextOperations } from "./http-text";
import { icalEventOperation } from "./ical-event";
import {
  identifierDefinitions,
  identifierInputSchema,
  identifierOutputSchema,
  runIdentifierValidation,
} from "./identifier-validators";
import { identityOperations } from "./identity-validation";
import {
  type ImageFormatsId,
  imageFormatsOperations,
  runImageFormatsTool,
} from "./image-formats";
import {
  imageMetadataOperations,
  runImageMetadataTool,
} from "./image-metadata";
import {
  type ImageOptimizerId,
  imageOptimizersOperations,
  runImageOptimizerTool,
} from "./image-optimizers";
import {
  PaletteError,
  paletteInputSchema,
  paletteOutputSchema,
  runImagePalette,
} from "./image-palette";
import {
  ImageServiceError,
  imageInputSchema,
  imageOutputSchema,
  MAX_IMAGE_BASE64,
  resizeImageOperation,
} from "./image-resizer";
import { runImageWebp, webpInputSchema, webpOutputSchema } from "./image-webp";
import { joseOperations } from "./jose-tools";
import { jsonQueryOperations } from "./json-query";
import { schemaToolOperations } from "./json-schema-tools";
import {
  kdfToolOperations,
  pbkdf2HttpSchema,
  scryptHttpSchema,
} from "./kdf-tools";
import {
  legacyHashDefinitions,
  legacyHashOutputSchema,
  legacyHashSchemas,
  runLegacyHashRequest,
} from "./legacy-hash";
import { streamHashHttpSchema, streamHashOperations } from "./legacy-hashes";
import { listSlugOperations } from "./list-slug";
import { localFontBookOperation } from "./local-font-book";
import {
  hmacOutputSchema,
  integrityDefinitions,
  integritySchemas,
  runIntegrity,
  sriOutputSchema,
} from "./mac-integrity";
import { markdownOperations, runMarkdownTool } from "./markdown-tools";
import { murmurHttpSchema, murmurOperations } from "./murmurhash3";
import {
  myIpAddressOperation,
  NetworkLookupError,
  networkLookupOperations,
} from "./network-lookups";
import { passwordOperations } from "./password-tools";
import {
  type PdfToolId,
  pdfEditingOperations,
  runPdfEditingTool,
} from "./pdf-editing";
import {
  type PdfFinishingId,
  pdfFinishingOperations,
  runPdfFinishingTool,
} from "./pdf-finishing";
import {
  type PdfReadingId,
  pdfReadingOperations,
  runPdfReadingTool,
} from "./pdf-reading";
import { pgpKeyOperation } from "./pgp-key-generator";
import { placeholderOperation } from "./placeholder";
import {
  gitignoreOperation,
  openapiHttpSchema,
  openapiOperation,
} from "./project-config";
import { qrOperations } from "./qr-tools";
import { radioTimecodeOperation } from "./radio-timecode";
import { ripemdHttpSchema, ripemdOperations } from "./ripemd-extended";
import {
  ScreenRecorderServiceError,
  screenRecorderOperation,
} from "./screen-recorder";
import { runSeoTool, seoOperations } from "./seo-generators";
import {
  runShortId,
  shortIdDefinitions,
  shortIdInputSchema,
  shortIdOutputSchema,
} from "./short-id";
import { sipHashHttpSchema, sipHashOperations } from "./siphash";
import { sshFingerprintHttpSchema, sshOperations } from "./ssh-tools";
import { structuredOperations } from "./structured-formats";
import {
  svgImageInputSchema,
  svgImageOperation,
  svgImageOutputSchema,
} from "./svg-image";
import { textAnalysisOperations } from "./text-analysis";
import { textCodecOperations } from "./text-codecs";
import { textUtilitiesOperations } from "./text-utilities";
import * as ula from "./ula";
import {
  runUnixTimestamp,
  unixTimestampInputSchema,
  unixTimestampOutputSchema,
} from "./unix-timestamp";
import { xmlJsonOperations } from "./xml-json";
import { xxHashOperations, xxHashSchemas } from "./xxhash";
export const caseInputSchema = z.strictObject({
  input: z.string().max(MAX_CASE_INPUT),
});
export const statisticsInputSchema = z.strictObject({
  input: z.string().max(MAX_STATISTICS_LENGTH),
  locale: z.enum(["en-US", "zh-CN"]).default("en-US"),
});
const caseOutputSchema = z.strictObject(
  Object.fromEntries(caseStyles.map((style) => [style, z.string()])),
);
const statisticsOutputSchema = z.strictObject({
  characters: z.number(),
  charactersNoSpaces: z.number(),
  words: z.number(),
  uniqueWords: z.number(),
  sentences: z.number(),
  paragraphs: z.number(),
  lines: z.number(),
  readingSeconds: z.number(),
  speakingSeconds: z.number(),
  averageWordLength: z.number(),
  averageSentenceWords: z.number(),
  lexicalDiversity: z.number(),
  longestSentenceWords: z.number(),
  longestParagraphWords: z.number(),
  repeatedTerms: z.array(
    z.strictObject({ term: z.string(), count: z.number() }),
  ),
});
export const base64InputSchema = z.strictObject({
  input: z.string().max(MAX_BASE64_INPUT_CHARACTERS),
  operation: z.enum(["encode", "decode"]).default("encode"),
});
export const urlInputSchema = z.strictObject({
  input: z.string().max(MAX_URL_INPUT),
  operation: z.enum(["encode", "decode"]).default("encode"),
  mode: z.enum(["component", "uri"]).default("component"),
});
export const jsonInputSchema = z.strictObject({
  input: z.string().max(MAX_JSON_LENGTH),
  indent: z
    .enum(["1", "2", "3", "4", "5", "6", "7", "8", "tab", "compact"])
    .default("2"),
});
export const jsonOutputSchema = z.strictObject({ output: z.string() });
export const operations: Operation[] = [
  faviconAssetsOperation,
  localFontBookOperation,
  radioTimecodeOperation,
  ...networkLookupOperations,
  myIpAddressOperation,
  currentNetworkTimeOperation,
  codeScreenshotOperation,
  colorPickerOperation,
  screenRecorderOperation,
  cameraOperation,
  audioRecorderOperation,
  asciiArtOperation,
  unitConverterOperation,
  deviceInformationOperation,
  archiveViewerOperation,
  icalEventOperation,
  { ...openapiOperation, inputSchema: openapiHttpSchema },
  gitignoreOperation,
  userAgentOperation,
  { ...dockerComposeOperation, inputSchema: dockerComposeHttpSchema },
  timerOperation,
  stopwatchOperation,
  ...gifAnimationOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runGifAnimationTool(
            op.id as GifAnimationId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...barcodeOperations,
  { ...curlConverterOperation, inputSchema: curlConverterHttpSchema },
  ...imageOptimizersOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runImageOptimizerTool(
            op.id as ImageOptimizerId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  pgpKeyOperation,
  ...qrOperations,
  ...certificateOperations.map((op) => ({
    ...op,
    inputSchema:
      op.id === "certificate-public-key-parser"
        ? certificateParseHttpSchema
        : op.inputSchema,
  })),
  ...imageFormatsOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runImageFormatsTool(
            op.id as ImageFormatsId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...sshOperations.map((op) => ({
    ...op,
    inputSchema:
      op.id === "ssh-public-key-fingerprint"
        ? sshFingerprintHttpSchema
        : op.inputSchema,
  })),
  ...joseOperations,
  ...formatterOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runFormatterTool(
            op.id as FormatterId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...pdfFinishingOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runPdfFinishingTool(
            op.id as PdfFinishingId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...cityHighwayOperations.map((op) => {
    const schema =
      op.id === "cityhash64-hash-text-or-file"
        ? cityHttpSchema
        : highwayHttpSchema;
    return {
      ...op,
      inputSchema: schema,
      run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
        op.run(
          context?.transport === "mcp" ? input : schema.parse(input),
          signal,
          context,
        ),
    };
  }),
  ...seoOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runSeoTool(op.id, input, signal, context.inputRoots ?? [], context)
        : op.run(input, signal, context),
  })),
  ...pdfReadingOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runPdfReadingTool(
            op.id as PdfReadingId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...sipHashOperations.map((op) => ({
    ...op,
    inputSchema: sipHashHttpSchema,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      op.run(
        context?.transport === "mcp" ? input : sipHashHttpSchema.parse(input),
        signal,
        context,
      ),
  })),
  ...ripemdOperations.map((op) => ({
    ...op,
    inputSchema: ripemdHttpSchema,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      op.run(
        context?.transport === "mcp" ? input : ripemdHttpSchema.parse(input),
        signal,
        context,
      ),
  })),
  ...pdfEditingOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runPdfEditingTool(
            op.id as PdfToolId,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...markdownOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runMarkdownTool(
            op.id,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...murmurOperations.map((op) => ({
    ...op,
    inputSchema: murmurHttpSchema,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      op.run(
        context?.transport === "mcp" ? input : murmurHttpSchema.parse(input),
        signal,
        context,
      ),
  })),
  {
    ...crcOperation,
    inputSchema: crcHttpSchema,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      crcOperation.run(
        context?.transport === "mcp" ? input : crcHttpSchema.parse(input),
        signal,
        context,
      ),
  },
  ...imageMetadataOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runImageMetadataTool(
            op.id,
            input,
            signal,
            context.inputRoots ?? [],
            context,
          )
        : op.run(input, signal, context),
  })),
  ...xxHashOperations.map((op) => {
    const algorithm = XXHASH_ALGORITHMS.find(
      (value) => op.id === `xxhash-${value.toLowerCase()}-hash-text-or-file`,
    );
    if (!algorithm) throw new Error("Unknown XXHash operation");
    const schema = xxHashSchemas(algorithm).http;
    return {
      ...op,
      inputSchema: schema,
      run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
        op.run(
          context?.transport === "mcp" ? input : schema.parse(input),
          signal,
          context,
        ),
    };
  }),
  ...schemaToolOperations,
  ...streamHashOperations.map((op) => ({
    ...op,
    inputSchema: streamHashHttpSchema,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      op.run(
        context?.transport === "mcp"
          ? input
          : streamHashHttpSchema.parse(input),
        signal,
        context,
      ),
  })),
  ...aesOperations.map((op) => ({
    ...op,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      context?.transport === "mcp"
        ? runAesTool(op.id, input, signal, context.inputRoots ?? [], context)
        : op.run(input, signal, context),
  })),
  ...identityOperations,
  ksuidOperation,
  ...jsonQueryOperations,
  mnemonicOperation,
  ...kdfToolOperations.map((op) => ({
    ...op,
    inputSchema:
      op.id === "pbkdf2-key-derivation" ? pbkdf2HttpSchema : scryptHttpSchema,
    run: (input: unknown, signal?: AbortSignal, context?: OperationContext) =>
      op.run(
        context?.transport === "mcp"
          ? input
          : (op.id === "pbkdf2-key-derivation"
              ? pbkdf2HttpSchema
              : scryptHttpSchema
            ).parse(input),
        signal,
        context,
      ),
  })),
  ...passwordOperations,
  ...argonToolOperations,
  ...bcryptToolOperations,
  randomNumberOperation,
  ...referenceOperations,
  ...cronToolOperations,
  ...textUtilitiesOperations,
  ...xmlJsonOperations,
  ...dataUriOperations,
  namedColorsOperation,
  ...dateToolOperations,
  ...structuredOperations,
  ...textAnalysisOperations,
  ...cidrToolOperations,
  ...csvJsonOperations,
  ...addressToolOperations,
  ...integrityDefinitions.map(
    (id): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description:
        id === "hmac-generator"
          ? "Generate HMAC SHA-1/256/384/512 from UTF8 text or raw bytes with a supplied key; returns HEX and Base64. Keys are not persisted. Only use explicitly provided keys; never include real secrets in shared examples or logs."
          : "Generate all SHA256/384/512 SRI tokens from text or bytes, optionally verify metadata using strongest-supported-algorithm matching. Does not fetch resources or prove origin trust.",
      inputSchema: integritySchemas(id).inline,
      outputSchema:
        id === "hmac-generator" ? hmacOutputSchema : sriOutputSchema,
      bodyLimit: MAX_HASH_BASE64 + 12_600_000,
      idempotent: true,
      run: (input, signal) => runIntegrity(id, input, signal),
    }),
  ),
  ...shortIdDefinitions.map(
    ([id, kind]): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description: `Generate cryptographically random ${kind} identifiers locally. ULID reveals its timestamp; monotonic ordering is within one batch only. IDs do not confer authorization.`,
      inputSchema: shortIdInputSchema(id),
      outputSchema: shortIdOutputSchema,
      bodyLimit: 10000,
      idempotent: false,
      run: async (input, signal) => ({
        ...(await runShortId(id, input, signal)),
      }),
    }),
  ),
  ...listSlugOperations,
  ...checksumDefinitions.map(
    ([id, kind]): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description: `Validate ${kind} format and checksum locally. ISBN does not prove assignment; VIN uses the North American ninth-position checksum; card Luhn does not prove authenticity or authorization. Never supply CVC.`,
      inputSchema: checksumInputSchema,
      outputSchema: checksumOutputSchema,
      bodyLimit: 4096,
      idempotent: true,
      run: (input, signal) => ({ ...runChecksumValidation(id, input, signal) }),
    }),
  ),
  chmodOperation,
  ...cssGeneratorOperations,
  ...identifierDefinitions.map(
    ([id, kind]): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description: `Validate ${kind} syntax and applicable checksums locally. Does not confirm account ownership/existence, bank registration, device identity or authenticity. Invalid identifiers return valid:false.`,
      inputSchema: identifierInputSchema,
      outputSchema: identifierOutputSchema,
      bodyLimit: 4096,
      idempotent: true,
      run: (input, signal) => ({
        ...runIdentifierValidation(id, input, signal),
      }),
    }),
  ),
  {
    id: "unix-timestamp-converter",
    name: "tooltab_unix_timestamp_converter",
    description:
      "Convert precise timestamp strings in seconds/milliseconds/nanoseconds, calendar text, or the current local service clock. Zones are explicit UTC or fixed offsets, no host-local zone. Returns exact numeric strings and ISO with nanoseconds. Mode now and relative text without referenceMilliseconds depend on the service clock.",
    inputSchema: unixTimestampInputSchema,
    outputSchema: unixTimestampOutputSchema,
    bodyLimit: 4096,
    idempotent: false,
    run: runUnixTimestamp,
  },
  ...colorToolOperations,
  {
    id: "svg-to-image",
    name: "tooltab_svg_to_image",
    description:
      "Rasterize validated self-contained SVG text into PNG/JPEG/WebP locally. Rejects scripts, external references, foreignObject and declarations using the shared browser validator. SVG UTF8 <=2,000,000 bytes; scaled output <=8192 per side and32MP; output <=6MiB Base64 bytes. quality0.01–1 default0.92, transparent true by default; JPEG uses chosen background. Rendering/fonts may differ from Canvas.",
    inputSchema: svgImageInputSchema,
    outputSchema: svgImageOutputSchema,
    bodyLimit: 12001000,
    idempotent: true,
    run: (input, signal) => svgImageOperation(input, signal),
  },
  placeholderOperation,
  ...legacyHashDefinitions.map(
    ([id, algorithm]): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description: `Compute ${algorithm} locally from UTF8 text or Base64 bytes with hex/base64/decimal/binary results. Legacy checksums only; not suitable for passwords, signatures, or security integrity. 4 MiB inline text/32 MiB inline raw bytes; upload or authorized MCP file streams up to 1 TiB (HTTP upload transport keeps its separate20MiB limit).`,
      inputSchema: legacyHashSchemas(id).http,
      outputSchema: legacyHashOutputSchema,
      bodyLimit: MAX_HASH_BASE64 + 2048,
      idempotent: true,
      run: (input, signal, context) =>
        runLegacyHashRequest(id, input, signal, context),
    }),
  ),
  ...textCodecOperations,
  {
    id: "palette-extractor",
    name: "tooltab_palette_extractor",
    description:
      "Extract 2–12 requested dominant colors with the exact browser clustering/color-value core. Local Sharp samples at most192px per side; alpha<128 pixels are excluded. Returns HEX/RGB/HSL and HEX/CSS/JSON export. PNG/JPEG/WebP only,20MiB and32MP/8192 source limits. Sharp sampling may differ slightly from Canvas.",
    inputSchema: paletteInputSchema,
    outputSchema: paletteOutputSchema,
    bodyLimit: MAX_IMAGE_BASE64 + 1024,
    idempotent: true,
    run: (input, signal) => runImagePalette(input, signal),
  },
  ...numberConverterOperations,
  ...httpTextOperations,
  {
    id: "image-to-webp",
    name: "tooltab_image_to_webp",
    description:
      "Convert 1–20 PNG/JPEG/WebP images locally, sequentially, with quality and proportional percent/one-dimension or exact two-dimension sizing. Artifact mode returns individual WebP files and ZIP with one-hour expiry. API uses uploadId or inline Base64; MCP supports authorized inputPath. Inline mode accepts exactly one image and returns at most 6 MiB. Source 20 MiB, dimensions 8192 per side/32 million pixels. Metadata stripped.",
    inputSchema: webpInputSchema,
    outputSchema: webpOutputSchema,
    bodyLimit: MAX_IMAGE_BASE64 + 4096,
    idempotent: false,
    run: runImageWebp,
  },
  {
    id: "image-resizer",
    name: "tooltab_image_resizer",
    description:
      "Resize PNG/JPEG/WebP locally with Sharp/libvips; EXIF orientation applied, metadata removed, JPEG white background. Input canonical Base64 bytes <=20 MiB; source/output <=8192 per side and 32 million pixels. Output encoded file <=6 MiB, returned as Base64. Quality 1–100. Native codec/resampling may differ from browser Canvas.",
    inputSchema: imageInputSchema,
    outputSchema: imageOutputSchema,
    bodyLimit: MAX_IMAGE_BASE64 + 1024,
    idempotent: true,
    run: (input, signal) => resizeImageOperation(input, signal),
  },
  ...uuidOperations,
  ...uuidNameOperations,
  ...uuidTimeOperations,
  ...uuidInspectorOperations,
  ...shaOperations,
  ...blakeDefinitions.map(
    ([id, algorithm]): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description: `Compute ${algorithm} locally from UTF8 text or Base64 raw bytes. OutputBits selects a supported digest length; BLAKE accepts optional keyBase64, Keccak rejects keys. No input/key bytes returned.`,
      inputSchema: blakeSchemas(id).inline,
      outputSchema: blakeOutputSchema,
      bodyLimit: MAX_HASH_BASE64 + 2048,
      idempotent: true,
      run: (input, signal) => runBlake(id, input, signal),
    }),
  ),
  ...baseEncodingDefinitions.map(
    ([id, kind, decode]): Operation => ({
      id,
      name: `tooltab_${id.replaceAll("-", "_")}`,
      description: `${decode ? "Decode" : "Encode"} ${kind} locally with UTF8 or raw-byte Base64 carriers. Base58/85 execute in Bun workers; Node without Worker explicitly returns unsupported. Maximum raw bytes 1 MiB, encoded-source text 4 MiB characters. Strict canonical validation; outputEncoding base64 preserves arbitrary binary.`,
      inputSchema: baseEncodingSchemas(id).inline,
      outputSchema: baseEncodingOutputSchema,
      bodyLimit: 4 * 1024 * 1024 * 6 + 1024,
      idempotent: true,
      run: (input, signal) => runBaseEncoding(id, input, signal),
    }),
  ),
  {
    id: ula.toolId,
    name: ula.toolName,
    description: ula.toolDescription,
    inputSchema: ula.inputSchema,
    outputSchema: ula.outputSchema,
    bodyLimit: 4096,
    idempotent: false,
    run: ula.generateUla,
  },
  {
    id: "json-formatter",
    name: automationToolNames["json-formatter"],
    description:
      "Validate and format JSON locally, preserving exact number lexemes including large integers. Maximum 2,000,000 UTF-16 code units and nesting depth 256.",
    inputSchema: jsonInputSchema,
    outputSchema: jsonOutputSchema,
    // JSON transport may escape each input code unit as six ASCII bytes.
    bodyLimit: MAX_JSON_LENGTH * 6 + 1024,
    idempotent: true,
    run(input) {
      const args = jsonInputSchema.parse(input);
      return { output: formatJson(args.input, args.indent) };
    },
  },
  {
    id: "base64-encoder-decoder",
    name: automationToolNames["base64-encoder-decoder"],
    description:
      "Encode UTF-8 text to canonical padded RFC 4648 Base64 or strictly decode Base64 to UTF-8. Maximum decoded/encoded source text size 1 MiB; rejects malformed padding, non-zero pad bits and invalid UTF-8.",
    inputSchema: base64InputSchema,
    outputSchema: jsonOutputSchema,
    bodyLimit: MAX_BASE64_INPUT_CHARACTERS * 6 + 1024,
    idempotent: true,
    run(input) {
      const args = base64InputSchema.parse(input);
      return {
        output:
          args.operation === "encode"
            ? encodeBase64Text(args.input)
            : decodeBase64Text(args.input),
      };
    },
  },
  {
    id: "url-component-encoder-decoder",
    name: automationToolNames["url-component-encoder-decoder"],
    description:
      "Encode or decode a URI component (default) or full URI using standard URI semantics. Preserves plus as plus when decoding; does not perform form-urlencoded conversion. Maximum 1,000,000 UTF-16 code units.",
    inputSchema: urlInputSchema,
    outputSchema: jsonOutputSchema,
    bodyLimit: MAX_URL_INPUT * 6 + 1024,
    idempotent: true,
    run(input) {
      const args = urlInputSchema.parse(input);
      return { output: transformUrl(args.input, args.operation, args.mode) };
    },
  },
  {
    id: "case-converter",
    name: automationToolNames["case-converter"],
    description:
      "Convert Unicode text into all 12 naming/case styles locally. Every style uses the same Unicode-aware word tokenization. Maximum 100,000 UTF-16 code units.",
    inputSchema: caseInputSchema,
    outputSchema: caseOutputSchema,
    bodyLimit: MAX_CASE_INPUT * 6 + 1024,
    idempotent: true,
    run(input) {
      const args = caseInputSchema.parse(input);
      return convertTextCases(args.input);
    },
  },
  {
    id: "text-statistics",
    name: automationToolNames["text-statistics"],
    description:
      "Analyze text locally using Intl.Segmenter with explicit en-US or zh-CN locale. Returns grapheme, word, sentence, paragraph counts, frequency and estimated reading/speaking durations. Maximum 100,000 UTF-16 code units.",
    inputSchema: statisticsInputSchema,
    outputSchema: statisticsOutputSchema,
    bodyLimit: MAX_STATISTICS_LENGTH * 6 + 1024,
    idempotent: true,
    run(input) {
      const args = statisticsInputSchema.parse(input);
      return { ...analyzeText(args.input, args.locale) };
    },
  },
];
export const metadata = operations.map((op) => ({
  id: op.id,
  name: op.name,
  description: op.description,
  inputSchema: z.toJSONSchema(op.inputSchema, { io: "input" }),
  outputSchema: z.toJSONSchema(op.outputSchema),
  bodyLimit: op.bodyLimit,
  network: false,
  files: [
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
}));
export function operationError(cause: unknown) {
  if (cause instanceof FaviconAssetsError)
    return {
      status: ["artifact_required", "too_large"].includes(cause.code)
        ? 413
        : 400,
      code: cause.code,
      message:
        "Favicon generation failed. Provide one supported canonical Base64 image within the size limit and request artifact delivery only through an artifact-capable transport.",
    };
  if (cause instanceof NetworkLookupError)
    return {
      status: cause.code === "network_failed" ? 503 : 400,
      code: cause.code,
      message:
        cause.code === "network_failed"
          ? "The fixed network lookup providers are temporarily unavailable."
          : "The network lookup input or provider response is invalid.",
    };
  if (cause instanceof CurrentNetworkTimeError)
    return {
      status: 503,
      code: cause.code,
      message:
        "Network time is temporarily unavailable. Retry when the fixed time source can be reached.",
    };
  if (cause instanceof CodeScreenshotError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : ["too_large", "output_too_large"].includes(cause.code)
            ? 413
            : ["timeout", "render_failed", "unsupported"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "Code screenshot rendering failed. Check the source, visual options, output format and size limits.",
    };
  if (cause instanceof ColorPickerError)
    return {
      status: cause.code === "too_large" ? 413 : 400,
      code: cause.code,
      message:
        "Color conversion failed. Provide one supported color value within the input limit.",
    };
  if (cause instanceof ScreenRecorderServiceError)
    return {
      status: ["too_large", "artifact_required"].includes(cause.code)
        ? 413
        : 400,
      code: cause.code,
      message:
        "Screen recording inspection failed. Provide one supported recording source within its size limit and choose a valid delivery mode.",
    };
  if (cause instanceof CameraServiceError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : [
                "input_too_large",
                "output_too_large",
                "artifact_required",
              ].includes(cause.code)
            ? 413
            : 400,
      code: cause.code,
      message:
        "Camera snapshot processing failed. Provide one supported image source within the size and pixel limits.",
    };
  if (cause instanceof AudioRecorderServiceError)
    return {
      status: ["too_large", "artifact_required"].includes(cause.code)
        ? 413
        : 400,
      code: cause.code,
      message:
        "Audio inspection failed. Provide one supported recording source within its size limit and choose a valid delivery mode.",
    };
  if (cause instanceof AsciiError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : ["output_too_large", "artifact_required"].includes(cause.code)
              ? 413
              : cause.code === "unsupported"
                ? 503
                : 400,
      code: cause.code,
      message:
        "ASCII art generation failed. Check the text, FIGlet font, alignment, width, delivery mode and size limits.",
    };
  if (cause instanceof ArchiveError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : [
                  "input_limit",
                  "expanded_limit",
                  "entry_limit",
                  "preview_limit",
                  "artifact_required",
                ].includes(cause.code)
              ? 413
              : cause.code === "read_failed"
                ? 503
                : 400,
      code: cause.code,
      message:
        "Archive operation failed. Check the archive, selected entry, delivery mode and size limits.",
    };
  if (cause instanceof IcalError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : [
                  "too_large",
                  "output_too_large",
                  "zone_capacity",
                  "artifact_required",
                ].includes(cause.code)
              ? 413
              : ["worker_failed", "generation_failed", "unsupported"].includes(
                    cause.code,
                  )
                ? 503
                : 400,
      code: cause.code,
      message:
        "Calendar event generation failed. Check event fields, time zone, recurrence and delivery mode.",
    };
  if (cause instanceof SchemaToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "JSON schema tool failed: syntax, references, precision, or resource limits.",
    };
  if (
    cause instanceof XxHashSeedError ||
    cause instanceof MurmurSeedError ||
    cause instanceof CitySeedError
  )
    return {
      status: 400,
      code: "invalid_seed",
      message: "Seed must be an unsigned decimal or hexadecimal string.",
    };
  if (cause instanceof ImageMetadataError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message: "Image metadata processing failed.",
    };
  if (cause instanceof MarkdownError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "Markdown conversion failed: input, nesting, resource limits or Worker availability.",
    };
  if (cause instanceof PdfEditingError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "PDF editing failed: document, selection, encryption or resource limits.",
    };
  if (cause instanceof HighwayKeyError)
    return {
      status: 400,
      code: "invalid_key",
      message:
        "HighwayHash requires a 32-byte hexadecimal key or a blank public default.",
    };
  if (cause instanceof SipHashKeyError)
    return {
      status: 400,
      code: "invalid_key",
      message: "SipHash requires a 16-byte hexadecimal key.",
    };
  if (cause instanceof PgpToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : ["worker_failed", "generation_failed"].includes(cause.code)
              ? 500
              : 400,
      code: cause.code,
      message:
        "OpenPGP key generation failed. Check identity and key parameters.",
    };
  if (cause instanceof CertificateToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : [
                  "worker_failed",
                  "operation_failed",
                  "generation_failed",
                ].includes(cause.code)
              ? 500
              : 400,
      code: cause.code,
      message:
        "Certificate operation failed. Check source, key and parameters.",
    };
  if (cause instanceof ProjectConfigError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : cause.code === "too_large"
              ? 413
              : ["generation_failed", "unsupported"].includes(cause.code)
                ? 503
                : 400,
      code: cause.code,
      message:
        "Local project configuration conversion failed. Check document, references, options and size.",
    };
  if (cause instanceof DeveloperParserError || cause instanceof UserAgentError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : cause.code === "too_large"
              ? 413
              : ["worker_failed", "unsupported"].includes(cause.code)
                ? 503
                : 400,
      code: cause.code,
      message:
        "Developer text parsing failed; source and credentials are omitted.",
    };
  if (cause instanceof CurlToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : ["worker_failed", "unsupported"].includes(cause.code)
              ? 503
              : ["input_limit", "output_limit", "too_large"].includes(
                    cause.code,
                  )
                ? 413
                : 400,
      code: cause.code,
      message:
        "cURL conversion failed. Check command and target; source is never executed.",
    };
  if (cause instanceof BarcodeError || cause instanceof QrError)
    return {
      status:
        cause.code === "too_large"
          ? 413
          : cause.code === "busy"
            ? 429
            : ["timeout", "unsupported"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "Code processing failed. Check content, image and capacity limits.",
    };
  if (cause instanceof AnimationError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : [
                  "input_limit",
                  "output_limit",
                  "pixel_limit",
                  "frame_limit",
                ].includes(cause.code)
              ? 413
              : ["unsupported", "conversion_failed"].includes(cause.code)
                ? 503
                : 400,
      code: cause.code,
      message: "Animation conversion failed. Check source and frame limits.",
    };
  if (cause instanceof OptimizerError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : ["input_limit", "output_limit", "pixel_limit"].includes(
                  cause.code,
                )
              ? 413
              : ["unsupported", "optimize_failed"].includes(cause.code)
                ? 503
                : 400,
      code: cause.code,
      message: "Image optimization failed. Check source and output limits.",
    };
  if (cause instanceof ImageFormatError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : ["input_limit", "output_limit", "pixel_limit"].includes(cause.code)
            ? 413
            : cause.code === "timeout"
              ? 504
              : ["unsupported", "conversion_failed"].includes(cause.code)
                ? 503
                : 400,
      code: cause.code,
      message:
        "Image conversion failed. Check source, format options and delivery limits.",
    };
  if (cause instanceof SshError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : [
                  "worker_failed",
                  "operation_failed",
                  "generation_failed",
                ].includes(cause.code)
              ? 500
              : 400,
      code: cause.code,
      message: "SSH operation failed. Check the key format and parameters.",
    };
  if (cause instanceof JoseToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "timeout"
            ? 504
            : ["worker_failed", "operation_failed"].includes(cause.code)
              ? 500
              : 400,
      code: cause.code,
      message:
        "JWT/JWK operation failed. Check the supplied format, algorithm and key.",
    };
  if (cause instanceof FormatterError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message: cause.message,
      details: { line: cause.line, column: cause.column },
    };
  if (cause instanceof SeoError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message: "Generation failed: verify the entry and resource limits.",
      ...(cause.index !== undefined ? { details: { index: cause.index } } : {}),
    };
  if (cause instanceof StreamHashError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["worker_failed", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message: "Streaming hash failed: input or computation unavailable.",
    };
  if (cause instanceof AesToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout", "random_unavailable"].includes(
                  cause.code,
                )
              ? 503
              : 400,
      code: cause.code,
      message: "AES operation failed; secret input and plaintext are omitted.",
    };
  if (cause instanceof IdentityError || cause instanceof EmailError)
    return {
      status: 400,
      code: cause.code,
      message: "Invalid local validation input.",
    };
  if (cause instanceof KsuidError)
    return {
      status: cause.code === "random" ? 503 : 400,
      code: cause.code,
      message: "KSUID input or secure randomness unavailable.",
    };
  if (cause instanceof QueryError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "Query failed: syntax, precision, pure-expression or resource limits.",
    };
  if (cause instanceof MnemonicError)
    return {
      status: cause.code === "random_failed" ? 503 : 400,
      code: cause.code,
      message: "Mnemonic operation failed; secret input is omitted.",
    };
  if (cause instanceof KdfError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "resource_limit"
            ? 413
            : ["random_failed", "worker_failed", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message: "Key derivation failed; password and salt input are omitted.",
    };
  if (cause instanceof PasswordToolError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "too_large"
            ? 413
            : ["unsupported", "timeout", "random_unavailable"].includes(
                  cause.code,
                )
              ? 503
              : 400,
      code: cause.code,
      message: "Password operation failed; secret input is omitted.",
    };
  if (cause instanceof ArgonError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : cause.code === "resource_limit"
            ? 413
            : ["random_failed", "worker_failed", "timeout"].includes(cause.code)
              ? 503
              : 400,
      code: cause.code,
      message:
        "Argon2 failed: invalid input or computation unavailable. Password and secret data are omitted.",
    };
  if (cause instanceof BcryptError)
    return {
      status:
        cause.code === "busy"
          ? 429
          : ["random_failed", "worker_failed", "timeout"].includes(cause.code)
            ? 503
            : 400,
      code: cause.code,
      message:
        "Bcrypt failed: invalid input or computation unavailable. Password data is omitted.",
    };
  if (cause instanceof RandomNumberError)
    return {
      status: cause.code === "random_unavailable" ? 503 : 400,
      code: cause.code,
      message: "Invalid random range/options or secure randomness unavailable.",
    };
  if (cause instanceof LookupError || cause instanceof CronToolError)
    return {
      status: 400,
      code: cause instanceof CronToolError ? cause.code : "invalid_input",
      message: "Invalid reference lookup or cron expression/options.",
    };
  if (cause instanceof DateToolError || cause instanceof BusinessDaysError)
    return {
      status: 400,
      code: cause.code,
      message: "Invalid date, zone, duration or working-day rules.",
    };
  if (cause instanceof CssGeneratorError)
    return {
      status: cause.code === "export_failed" ? 500 : 400,
      code: cause.code,
      message: "Invalid CSS configuration or export failed.",
    };
  if (cause instanceof TimestampError)
    return {
      status: 400,
      code: cause.code,
      message: "Invalid timestamp, date, offset or representable range.",
    };
  if (cause instanceof ColorError)
    return {
      status: 400,
      code: cause.code,
      message: "Invalid color syntax or input too long.",
    };
  if (cause instanceof CidrError)
    return {
      status:
        cause.code === "too_large"
          ? 413
          : cause.code === "unsupported"
            ? 503
            : 400,
      code: cause.code,
      message: "CIDR input could not be processed.",
      details: {
        issueCount: cause.issues.length,
        issues: cause.issues.slice(0, 10),
      },
    };
  if (
    cause instanceof StructuredError ||
    cause instanceof TextAnalysisError ||
    cause instanceof XmlJsonError ||
    cause instanceof TextUtilityError ||
    cause instanceof DataUriError
  )
    return {
      status:
        cause.code === "too_large"
          ? 413
          : cause.code === "busy"
            ? 429
            : ["timeout", "unsupported", "artifact_required"].includes(
                  cause.code,
                )
              ? 503
              : 400,
      code: cause.code,
      message:
        "Text conversion or analysis failed; input is not included in errors.",
      ...(cause instanceof StructuredError || cause instanceof XmlJsonError
        ? { details: { line: cause.line, column: cause.column } }
        : {}),
    };
  if (cause instanceof CsvJsonError)
    return {
      status:
        cause.code === "too_large"
          ? 413
          : cause.code === "busy"
            ? 429
            : ["timeout", "unsupported", "artifact_required"].includes(
                  cause.code,
                )
              ? 503
              : 400,
      code: cause.code,
      message:
        "CSV/JSON conversion failed: invalid input/options, resource limit, or worker unavailable.",
    };
  if (cause instanceof AddressError)
    return { status: 400, code: cause.code, message: "Invalid address input." };
  if (cause instanceof IntegrityError)
    return {
      status: 400,
      code: cause.code,
      message: "Invalid integrity input, key or metadata, or file read failed.",
    };
  if (
    cause instanceof NanoIdShortIdError ||
    cause instanceof Cuid2ShortIdError ||
    cause instanceof UlidShortIdError
  )
    return {
      status:
        cause.code === "unsupported" || cause.code === "generation-failed"
          ? 503
          : 400,
      code: cause.code,
      message: "Invalid identifier options or secure generation unavailable.",
    };
  if (cause instanceof ListSlugError)
    return {
      status: cause.code === "too_large" ? 413 : 400,
      code: cause.code,
      message: "Invalid list or slug input, or capacity exceeded.",
    };
  if (
    cause instanceof TextCodecError ||
    cause instanceof UnicodeCodecError ||
    cause instanceof RotCipherError
  )
    return {
      status: 400,
      code: cause.code,
      message: "Invalid text codec input or capacity exceeded.",
    };
  if (cause instanceof PaletteError)
    return { status: 400, code: cause.code, message: cause.message };
  if (
    cause instanceof NumberConversionError ||
    cause instanceof NumberBaseConversionError ||
    cause instanceof RomanNumeralConversionError ||
    cause instanceof BasicAuthGeneratorError ||
    cause instanceof BasicAuthDecoderError ||
    cause instanceof CookieError
  )
    return {
      status: 400,
      code: cause.code,
      message:
        "Input is invalid for this conversion. No input data is included in this error.",
    };
  if (cause instanceof ArtifactError)
    return {
      status:
        cause.code === "ARTIFACT_NOT_FOUND"
          ? 404
          : cause.code === "ARTIFACT_TOO_LARGE"
            ? 413
            : 503,
      code: cause.code,
      message: cause.code,
    };
  if (cause instanceof UuidTimeError)
    return {
      status: cause.code === "crypto_unavailable" ? 503 : 400,
      code: cause.code,
      message:
        cause.code === "crypto_unavailable"
          ? "Secure UUID randomness unavailable."
          : "Invalid UUID time, tick, count, node, sequence, version or variant.",
    };
  if (cause instanceof BaseEncodingError)
    return {
      status:
        cause.code === "unsupported"
          ? 503
          : cause.code === "too-large"
            ? 413
            : 400,
      code: cause.code,
      message: {
        unsupported: "This encoding requires the Bun worker runtime.",
        "too-large": "Base encoding input exceeds its byte/text size limit.",
        "invalid-encoding": "Malformed Base16/Base32 representation.",
        "invalid-utf8":
          "Input or decoded bytes are not valid UTF8 text; request base64 output for binary.",
      }[cause.code],
    };
  if (cause instanceof UuidNameError)
    return {
      status: cause.code === "too_large" ? 413 : 400,
      code: cause.code,
      message:
        "UUID namespace must be canonical and name must be valid Unicode within 100,000 characters.",
    };
  if (cause instanceof BlakeHashError)
    return {
      status:
        cause.code === "too-large"
          ? 413
          : cause.code === "unsupported" || cause.code === "digest-failed"
            ? 503
            : 400,
      code: cause.code,
      message: {
        "invalid-length": "Unsupported digest output bit length.",
        "invalid-key": "Key length is invalid for this BLAKE algorithm.",
        "invalid-base64": "Key must be canonical Base64.",
        "too-large": "Input exceeds the hash byte limit.",
        unsupported: "Hash algorithm unavailable.",
        "digest-failed": "Hash computation failed.",
      }[cause.code],
    };
  if (cause instanceof UuidInspectionError)
    return {
      status: 400,
      code: cause.code,
      message:
        "Invalid UUID or unsigned 128-bit representation for the selected format.",
    };
  if (cause instanceof ImageServiceError)
    return {
      status:
        cause.code === "BUSY"
          ? 429
          : cause.code === "INPUT_TOO_LARGE" ||
              cause.code === "OUTPUT_TOO_LARGE"
            ? 413
            : 400,
      code: cause.code,
      message: {
        INVALID_IMAGE: "Expected PNG/JPEG/WebP bytes or canonical Base64.",
        INVALID_DIMENSIONS:
          "Image dimensions exceed 8192 per side or 32 million pixels.",
        INVALID_OPTIONS: "Invalid image resize options.",
        INPUT_TOO_LARGE: "Image input exceeds 20 MiB.",
        OUTPUT_TOO_LARGE:
          "Encoded image exceeds its output limit (6 MiB inline or 64 MiB batch artifact); choose smaller dimensions or lower quality.",
        DECODE_FAILED: "Image decoding or encoding failed.",
        BUSY: "At most two native image operations may run at once.",
      }[cause.code],
    };
  if (cause instanceof UuidV7Error)
    return {
      status:
        cause.code === "invalid_count" || cause.code === "invalid_timestamp"
          ? 400
          : 503,
      code: cause.code,
      message: {
        invalid_count: "UUIDv7 count must be 1–100.",
        invalid_timestamp:
          "UUIDv7 timestamp must be a 48-bit nonnegative Unix millisecond integer.",
        crypto_unavailable: "Secure UUID randomness unavailable.",
        random_overflow:
          "UUIDv7 random sequence overflow; generate a new batch.",
      }[cause.code],
    };
  if (cause instanceof FileAccessError)
    return {
      status:
        cause.code === "FILE_TOO_LARGE"
          ? 413
          : cause.code === "PATH_NOT_ALLOWED"
            ? 403
            : 400,
      code: cause.code,
      message: {
        PATH_NOT_ALLOWED:
          "Path must refer to a regular file within an explicitly authorized --input-root directory.",
        FILE_TOO_LARGE: "File exceeds the 32 MiB hash limit.",
        FILE_CHANGED: "File changed while reading; retry with a stable file.",
        READ_FAILED: "Could not read the selected file.",
      }[cause.code],
    };
  if (cause instanceof HashBytesEncodingError)
    return {
      status: 400,
      code: "invalid-base64",
      message: "Raw bytes require canonical padded Base64.",
    };
  if (cause instanceof ShaHashError)
    return {
      status:
        cause.code === "too-large"
          ? 413
          : ["invalid-text", "invalid-length"].includes(cause.code)
            ? 400
            : 503,
      code: cause.code,
      message: {
        "too-large": "SHA input exceeds the 4 MiB text or 32 MiB byte limit.",
        "invalid-text": "Text contains invalid Unicode.",
        "invalid-length":
          "SHAKE output length must be 8–65536 bits in multiples of 8.",
        unsupported: "Web Crypto SHA support is unavailable.",
        "read-failed": "Could not read hash input.",
        "digest-failed": "SHA computation failed.",
      }[cause.code],
    };
  if (
    cause instanceof Error &&
    (cause.name === "AbortError" || cause.name === "TimeoutError")
  )
    return {
      status: cause.name === "TimeoutError" ? 504 : 408,
      code: cause.name === "TimeoutError" ? "TIMEOUT" : "CANCELLED",
      message: "Tool operation cancelled or timed out.",
    };
  if (cause instanceof UuidGenerationError)
    return {
      status: cause.code === "invalid_count" ? 400 : 503,
      code: cause.code,
      message:
        cause.code === "invalid_count"
          ? "UUID count must be an integer from 1 to 1000."
          : "Secure UUID randomness unavailable.",
    };
  if (cause instanceof CaseConversionError)
    return {
      status: cause.code === "too_large" ? 413 : 400,
      code: cause.code,
      message:
        cause.code === "too_large"
          ? "Case input exceeds 100,000 characters."
          : "Input contains invalid Unicode.",
    };
  if (cause instanceof TextStatisticsError)
    return {
      status: cause.code === "too-large" ? 413 : 503,
      code: cause.code,
      message:
        cause.code === "too-large"
          ? "Statistics input exceeds 100,000 characters."
          : "Intl.Segmenter is unavailable.",
    };
  if (cause instanceof Base64Error)
    return {
      status: cause.code === "too-large" ? 413 : 400,
      code: cause.code,
      message: {
        "too-large": "Base64 text exceeds its 1 MiB byte limit.",
        "invalid-base64": "Expected canonical padded Base64.",
        "invalid-utf8": "Input is not valid Unicode or decoded UTF-8 text.",
      }[cause.code],
    };
  if (cause instanceof UrlCodecError)
    return {
      status: cause.code === "too_large" ? 413 : 400,
      code: cause.code,
      message: {
        too_large: "URL input exceeds 1,000,000 characters.",
        invalid_unicode: "Input contains invalid Unicode.",
        invalid_encoding:
          "Input contains malformed URI escapes or invalid encoded UTF-8.",
      }[cause.code],
    };
  if (cause instanceof JsonFormatError)
    return {
      status: ["too_large", "output_too_large"].includes(cause.code)
        ? 413
        : 400,
      code: cause.code,
      message: {
        invalid: "Invalid JSON input.",
        too_large: "JSON input exceeds 2,000,000 characters.",
        too_deep: "JSON nesting exceeds depth 256.",
        output_too_large: "Formatted JSON exceeds the output size limit.",
      }[cause.code],
    };
  if (cause instanceof z.ZodError) {
    const tooLarge = cause.issues.some(
      (issue) => issue.code === "too_big" && issue.origin === "string",
    );
    return {
      status: tooLarge ? 413 : 400,
      code: tooLarge ? "too_large" : "INVALID_INPUT",
      message: tooLarge
        ? "Input exceeds the tool size limit."
        : "Arguments do not match the tool schema; unknown fields are rejected.",
    };
  }
  return {
    status: 503,
    code: "RUNTIME_UNAVAILABLE",
    message: "Local tool execution failed.",
  };
}
