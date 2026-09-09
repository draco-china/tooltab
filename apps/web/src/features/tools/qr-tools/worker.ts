import { generateQr, readQr } from "@workspace/tools/encoding/qr";
import {
  type QrContent,
  QrError,
  type QrOptions,
} from "@workspace/tools/encoding/qr-contract";
export type QrJob =
  | { kind: "generate"; content: QrContent; options: QrOptions }
  | { kind: "read"; data: Uint8ClampedArray; width: number; height: number };
self.onmessage = async (event: MessageEvent<QrJob>) => {
  try {
    const job = event.data;
    const result =
      job.kind === "generate"
        ? await generateQr(job.content, job.options)
        : readQr(job.data, job.width, job.height);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({
      error: { code: e instanceof QrError ? e.code : "invalid_input" },
    });
  }
};
