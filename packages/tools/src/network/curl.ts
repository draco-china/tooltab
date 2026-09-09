import * as converter from "curlconverter";
import parser from "curlconverter/dist/src/shell/Parser.js";
import {
  MAX_CURL_INPUT,
  MAX_CURL_OUTPUT,
  TARGETS,
  type CurlConversionResult,
  type CurlOptions,
  CurlToolError,
} from "./curl-contract";

// curlconverter's parser has a small default buffer. This package entry still
// relies on the environment-specific parser alias supplied by the caller's
// worker build; it must not initialize browser or WASM globals itself.
if (
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(parser), "parse")
    ?.writable !== false
) {
  const parse = parser.parse.bind(parser);
  parser.parse = (input, oldTree, options) =>
    parse(input, oldTree, {
      ...options,
      bufferSize:
        typeof input === "string"
          ? Math.max(32768, input.length * 2 + 4)
          : options?.bufferSize,
    });
}

const generators = {
  toJavaScriptWarn: converter.toJavaScriptWarn,
  toJavaScriptJqueryWarn: converter.toJavaScriptJqueryWarn,
  toJavaScriptXHRWarn: converter.toJavaScriptXHRWarn,
  toNodeWarn: converter.toNodeWarn,
  toNodeAxiosWarn: converter.toNodeAxiosWarn,
  toNodeGotWarn: converter.toNodeGotWarn,
  toNodeHttpWarn: converter.toNodeHttpWarn,
  toNodeKyWarn: converter.toNodeKyWarn,
  toNodeSuperAgentWarn: converter.toNodeSuperAgentWarn,
  toNodeRequestWarn: converter.toNodeRequestWarn,
  toPythonWarn: converter.toPythonWarn,
  toPythonHttpWarn: converter.toPythonHttpWarn,
  toJavaWarn: converter.toJavaWarn,
  toJavaHttpUrlConnectionWarn: converter.toJavaHttpUrlConnectionWarn,
  toJavaOkHttpWarn: converter.toJavaOkHttpWarn,
  toJavaJsoupWarn: converter.toJavaJsoupWarn,
  toPhpWarn: converter.toPhpWarn,
  toPhpGuzzleWarn: converter.toPhpGuzzleWarn,
  toPhpRequestsWarn: converter.toPhpRequestsWarn,
  toRubyWarn: converter.toRubyWarn,
  toRubyHttpartyWarn: converter.toRubyHttpartyWarn,
  toRWarn: converter.toRWarn,
  toRHttr2Warn: converter.toRHttr2Warn,
  toPowershellRestMethodWarn: converter.toPowershellRestMethodWarn,
  toPowershellWebRequestWarn: converter.toPowershellWebRequestWarn,
  toHTTPWarn: converter.toHTTPWarn,
  toHttpieWarn: converter.toHttpieWarn,
  toWgetWarn: converter.toWgetWarn,
  toJsonStringWarn: converter.toJsonStringWarn,
  toHarStringWarn: converter.toHarStringWarn,
  toAnsibleWarn: converter.toAnsibleWarn,
  toCWarn: converter.toCWarn,
  toCSharpWarn: converter.toCSharpWarn,
  toClojureWarn: converter.toClojureWarn,
  toCFMLWarn: converter.toCFMLWarn,
  toDartWarn: converter.toDartWarn,
  toElixirWarn: converter.toElixirWarn,
  toGoWarn: converter.toGoWarn,
  toJuliaWarn: converter.toJuliaWarn,
  toKotlinWarn: converter.toKotlinWarn,
  toLuaWarn: converter.toLuaWarn,
  toMATLABWarn: converter.toMATLABWarn,
  toObjectiveCWarn: converter.toObjectiveCWarn,
  toOCamlWarn: converter.toOCamlWarn,
  toPerlWarn: converter.toPerlWarn,
  toRustWarn: converter.toRustWarn,
  toSwiftWarn: converter.toSwiftWarn,
};

export function asyncFetch(source: string) {
  const imports: string[] = [],
    body: string[] = [];
  let calls = 0;
  for (const line of source.split("\n")) {
    if (/^import\s/.test(line.trimStart())) {
      imports.push(line);
      continue;
    }
    if (/^\s*(?:[\w$]+\.)?fetch\(/.test(line)) {
      calls++;
      body.push(
        line.replace(
          /^(\s*)/,
          `$1const response${calls === 1 ? "" : calls} = await `,
        ),
      );
    } else body.push(line);
  }
  if (!calls) return source;
  return `${imports.length ? `${imports.join("\n")}\n\n` : ""}async function run() {\n${body
    .filter((line) => line.trim())
    .map((line) => `  ${line}`)
    .join("\n")}\n}\n\nrun();\n`;
}

/** Normalize converter failures without exposing arbitrary thrown values. */
export function curlErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversion failed";
}

export function convertCurl(p: CurlOptions): CurlConversionResult {
  if (
    p.input.length > MAX_CURL_INPUT ||
    new TextEncoder().encode(p.input).length > MAX_CURL_INPUT
  )
    throw new CurlToolError("too_large");
  if (/[\uD800-\uDFFF]/u.test(p.input))
    throw new CurlToolError("invalid_unicode");
  const target = TARGETS.find((entry) => entry[0] === p.target);
  if (!target) throw new CurlToolError("invalid_target");
  const result: CurlConversionResult = {
    output: "",
    warnings: [],
    error: null,
    filename: `converted.${target[3]}`,
  };
  if (!p.input.trim()) return result;
  try {
    const [value, warnings] = generators[target[5]](p.input.trim());
    // Every selected generator returns text, including toJsonStringWarn and
    // toHarStringWarn. Object-producing APIs are deliberately not registered.
    let output: string = value;
    if (p.target === "javascript-fetch" || p.target === "node-fetch")
      output = asyncFetch(output);
    if (output.length > MAX_CURL_OUTPUT)
      throw new CurlToolError("output_too_large");
    result.output = output;
    result.warnings = warnings.map(([code, message]) => ({ code, message }));
  } catch (error) {
    if (error instanceof CurlToolError) throw error;
    result.error = curlErrorMessage(error);
  }
  return result;
}
