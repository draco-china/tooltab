/// <reference lib="webworker" />
import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("xml", xml);

import wasmUrl from "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url";
import { optimizeImage } from "@workspace/tools/image/optimizer-runtime";
import {
  OptimizerError,
  type OptimizerResult,
  type OptimizerJob,
} from "@workspace/tools/image/optimizer";

const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<OptimizerJob>) => {
  try {
    const wasm =
      e.data.kind === "png"
        ? new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer())
        : undefined;
    const result: OptimizerResult & { highlighted?: string } =
      await optimizeImage(e.data, wasm);
    if (e.data.kind === "svg")
      result.highlighted = hljs.highlight(
        new TextDecoder().decode(result.bytes.subarray(0, 65536)),
        { language: "xml" },
      ).value;
    scope.postMessage({ result }, [result.bytes.buffer]);
  } catch (error) {
    scope.postMessage({
      error: error instanceof OptimizerError ? error.code : "optimize_failed",
    });
  }
};
