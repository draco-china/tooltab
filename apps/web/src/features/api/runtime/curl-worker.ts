import { fileURLToPath } from "node:url";
import { plugin } from "bun";
import {
  type CurlOptions,
  CurlToolError,
} from "@workspace/tools/network/curl-contract";

// Only this Worker resolves the library's parser to its standard WASM equivalent.
// Loading native tree-sitter in repeatedly terminated Bun Workers crashes N-API.
plugin({
  name: "curl-local-wasm-parser",
  setup(build) {
    build.onResolve({ filter: /Parser\.js$/ }, (args) => {
      if (
        args.path === "curlconverter/dist/src/shell/Parser.js" ||
        (args.path === "./Parser.js" &&
          args.importer.endsWith("/curlconverter/dist/src/shell/tokenizer.js"))
      )
        return {
          path: fileURLToPath(
            new URL("./curl-wasm-parser.ts", import.meta.url),
          ),
        };
    });
  },
});
const core = import("@/features/tools/curl-converter/core");
self.onmessage = async (event: MessageEvent<CurlOptions>) => {
  try {
    self.postMessage({ result: (await core).convertCurl(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof CurlToolError ? error.code : "conversion_failed",
    });
  }
};
