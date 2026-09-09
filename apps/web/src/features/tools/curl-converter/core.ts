import hljs from "highlight.js";
import { convertCurl as convertCurlDomain } from "@workspace/tools/network/curl";
import {
  TARGETS,
  type CurlOptions,
} from "@workspace/tools/network/curl-contract";
import { CURL_PREVIEW, type CurlResult } from "./types";

/**
 * App adapter: the package owns conversion and validation; highlighting and
 * preview state remain presentation concerns of the web feature.
 */
export function convertCurl(p: CurlOptions): CurlResult {
  const result = convertCurlDomain(p);
  if (!result.output)
    return { ...result, highlighted: "", previewTruncated: false };

  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const target = TARGETS.find((entry) => entry[0] === p.target)!;
  const preview = result.output.slice(0, CURL_PREVIEW);
  try {
    return {
      ...result,
      highlighted: hljs.highlight(preview, {
        language: target[4],
      }).value,
      previewTruncated: preview.length < result.output.length,
    };
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : "Conversion failed",
      highlighted: "",
      previewTruncated: preview.length < result.output.length,
    };
  }
}
