import { generateBarcode } from "@workspace/tools/encoding/barcode-generate";
import {
  BarcodeError,
  barcodeOptionsSchema,
} from "@workspace/tools/encoding/barcode-contract";

export interface BarcodeGenerateJob {
  kind: "generate";
  options: unknown;
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const candidate = event.data as BarcodeGenerateJob;
    if (candidate?.kind !== "generate") throw new BarcodeError("invalid_input");
    const options = barcodeOptionsSchema.parse(candidate.options);
    let context: OffscreenCanvasRenderingContext2D | null = null;
    const result = await generateBarcode(options, (text, size) => {
      if (!context) {
        if (typeof OffscreenCanvas === "undefined")
          throw new BarcodeError("unsupported");
        context = new OffscreenCanvas(1, 1).getContext("2d");
        if (!context) throw new BarcodeError("unsupported");
      }
      context.font = `${size}px monospace`;
      return context.measureText(text).width;
    });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: {
        code: error instanceof BarcodeError ? error.code : "invalid_input",
      },
    });
  }
};
