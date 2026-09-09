import { pngCrc } from "./metadata-containers";
export const PNG_INPUT_LIMIT = 64 * 1048576,
  SVG_INPUT_LIMIT = 16 * 1048576,
  OPTIMIZER_OUTPUT_LIMIT = 128 * 1048576;
export type OptimizerCode =
  | "invalid_input"
  | "invalid_options"
  | "input_limit"
  | "output_limit"
  | "pixel_limit"
  | "unsupported"
  | "timeout"
  | "busy"
  | "artifact_required"
  | "optimize_failed";
export class OptimizerError extends Error {
  constructor(public code: OptimizerCode) {
    super(code);
    this.name = "OptimizerError";
  }
}
export type PngOptions = {
  level: number;
  interlace: boolean;
  optimiseAlpha: boolean;
};
export const pngDefaults: PngOptions = {
  level: 2,
  interlace: false,
  optimiseAlpha: true,
};
export type SvgOptions = {
  multipass: boolean;
  removeComments: boolean;
  removeMetadata: boolean;
  cleanupIds: boolean;
  convertColors: boolean;
  removeDimensions: boolean;
  inlineStyles: boolean;
};
export const svgDefaults: SvgOptions = {
  multipass: true,
  removeComments: true,
  removeMetadata: true,
  cleanupIds: true,
  convertColors: true,
  removeDimensions: false,
  inlineStyles: false,
};
export type OptimizerJob =
  | { kind: "png"; bytes: Uint8Array<ArrayBuffer>; options: PngOptions }
  | { kind: "svg"; input: string; options: SvgOptions };
export type OptimizerResult = {
  bytes: Uint8Array<ArrayBuffer>;
  originalBytes: number;
  optimizedBytes: number;
  savedBytes: number;
  savedPercent: number;
  width?: number;
  height?: number;
  bitDepth?: number;
  animated?: boolean;
  interlaced?: boolean;
  chunksRemoved?: string[];
  chunksChanged?: string[];
};
export function metrics(originalBytes: number, bytes: Uint8Array<ArrayBuffer>) {
  if (bytes.length > OPTIMIZER_OUTPUT_LIMIT)
    throw new OptimizerError("output_limit");
  return {
    bytes,
    originalBytes,
    optimizedBytes: bytes.length,
    savedBytes: originalBytes - bytes.length,
    savedPercent: originalBytes
      ? ((originalBytes - bytes.length) / originalBytes) * 100
      : 0,
  };
}
export function inspectPng(bytes: Uint8Array, limit = PNG_INPUT_LIMIT) {
  if (bytes.length > limit) throw new OptimizerError("input_limit");
  if (
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  )
    throw new OptimizerError("invalid_input");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    chunks: { type: string; bytes: Uint8Array }[] = [];
  let at = 8,
    ended = false;
  while (at < bytes.length) {
    if (chunks.length >= 100000 || at + 12 > bytes.length)
      throw new OptimizerError("invalid_input");
    const len = v.getUint32(at),
      type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8)),
      end = at + 12 + len;
    if (
      end > bytes.length ||
      !/^[A-Za-z]{4}(?![\s\S])/.test(type) ||
      pngCrc(bytes.subarray(at + 4, end - 4)) !== v.getUint32(end - 4)
    )
      throw new OptimizerError("invalid_input");
    chunks.push({ type, bytes: bytes.subarray(at + 8, end - 4) });
    at = end;
    if (type === "IEND") {
      if (len || at !== bytes.length) throw new OptimizerError("invalid_input");
      ended = true;
      break;
    }
  }
  if (
    !ended ||
    chunks[0]?.type !== "IHDR" ||
    chunks[0].bytes.length !== 13 ||
    !chunks.some((c) => c.type === "IDAT")
  )
    throw new OptimizerError("invalid_input");
  const width = v.getUint32(16),
    height = v.getUint32(20);
  if (
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 64_000_000
  )
    throw new OptimizerError("pixel_limit");
  return {
    width,
    height,
    bitDepth: bytes[24],
    animated: chunks.some((c) => c.type === "acTL"),
    chunks,
  };
}
const invalidXml =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject XML 1.0 forbidden characters and unpaired surrogates.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;
export function validateJob(job: OptimizerJob) {
  if (job.kind === "png") {
    const o = job.options;
    if (
      !Number.isInteger(o.level) ||
      o.level < 0 ||
      o.level > 6 ||
      typeof o.interlace !== "boolean" ||
      typeof o.optimiseAlpha !== "boolean"
    )
      throw new OptimizerError("invalid_options");
    inspectPng(job.bytes);
  } else {
    if (new TextEncoder().encode(job.input).length > SVG_INPUT_LIMIT)
      throw new OptimizerError("input_limit");
    if (
      Object.keys(svgDefaults).some(
        (k) => typeof job.options[k as keyof SvgOptions] !== "boolean",
      )
    )
      throw new OptimizerError("invalid_options");
    if (
      !job.input.trim() ||
      invalidXml.test(job.input) ||
      /<!DOCTYPE|<!ENTITY/i.test(job.input)
    )
      throw new OptimizerError("invalid_input");
  }
}
export function optimizedName(name: string, kind: "png" | "svg") {
  return `${
    name
      .replaceAll("\\", "_")
      .replaceAll("/", "_")
      .replace(/\.[^.]*$/, "")
      .trim()
      .slice(0, 150) || "image"
  }-optimized.${kind}`;
}
