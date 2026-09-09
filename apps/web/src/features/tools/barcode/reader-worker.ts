import { prepareZXingModule } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { readBarcode } from "@workspace/tools/encoding/barcode-read";
import { BarcodeError } from "@workspace/tools/encoding/barcode-contract";
import { barcodeReadJobSchema } from "./types";

prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const job = barcodeReadJobSchema.parse(event.data);
    const result = await readBarcode(job.data, job.width, job.height);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: {
        code: error instanceof BarcodeError ? error.code : "invalid_input",
      },
    });
  }
};
