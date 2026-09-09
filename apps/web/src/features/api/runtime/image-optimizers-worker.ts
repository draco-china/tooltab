import { readFile } from "node:fs/promises";
import { optimizeImage } from "@workspace/tools/image/optimizer-runtime";
import {
  OptimizerError,
  type OptimizerJob,
} from "@workspace/tools/image/optimizer";

const scope = self as unknown as {
  onmessage: (e: MessageEvent<OptimizerJob>) => void;
  postMessage: (d: unknown, t?: Transferable[]) => void;
};
scope.onmessage = async (e) => {
  try {
    const wasm =
      e.data.kind === "png"
        ? new Uint8Array(
            await readFile(
              new URL(
                import.meta.resolve(
                  "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm",
                ),
              ),
            ),
          )
        : undefined;
    const result = await optimizeImage(e.data, wasm);
    scope.postMessage({ result }, [result.bytes.buffer]);
  } catch (error) {
    scope.postMessage({
      error: error instanceof OptimizerError ? error.code : "optimize_failed",
    });
  }
};
