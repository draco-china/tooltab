import { readFileSync } from "node:fs";
import { prepareZXingModule } from "zxing-wasm/reader";

prepareZXingModule({
  overrides: {
    wasmBinary: readFileSync(
      new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm")),
    ),
    locateFile: () =>
      new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"))
        .pathname,
  },
});

import { createCanvas } from "@napi-rs/canvas";

const context = createCanvas(1, 1).getContext("2d");

import { readBarcode } from "@workspace/tools/encoding/barcode-read";
import { generateBarcode } from "@workspace/tools/encoding/barcode-generate";
import {
  BarcodeError,
  type BarcodeOptions,
} from "@workspace/tools/encoding/barcode-contract";
export type BarcodeJob =
  | { kind: "generate"; options: BarcodeOptions }
  | {
      kind: "read";
      data: Uint8ClampedArray<ArrayBuffer>;
      width: number;
      height: number;
    };
self.onmessage = async (event: MessageEvent<BarcodeJob>) => {
  try {
    const job = event.data;
    const result =
      job.kind === "generate"
        ? await generateBarcode(job.options, (text, size) => {
            context.font = `${size}px monospace`;
            return context.measureText(text).width;
          })
        : await readBarcode(job.data, job.width, job.height);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({
      error: { code: e instanceof BarcodeError ? e.code : "invalid_input" },
    });
  }
};
