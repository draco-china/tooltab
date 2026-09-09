import type { CurlConversionResult } from "@workspace/tools/network/curl-contract";

export const CURL_PREVIEW = 200000;
export type CurlResult = CurlConversionResult & {
  highlighted: string;
  previewTruncated: boolean;
};
