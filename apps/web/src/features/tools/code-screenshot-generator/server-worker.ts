import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  CODE_SCREENSHOT_MAX_DIMENSION,
  CODE_SCREENSHOT_MAX_PIXELS,
  type CodeScreenshotOptions,
  renderCodeScreenshot,
} from "@workspace/tools/image/code-screenshot";

export type ServerRenderJob = {
  options: CodeScreenshotOptions;
  format: "png" | "jpeg" | "webp" | "svg" | "html";
  scale: number;
  quality: number;
};
const scope = self as unknown as {
  onmessage: (event: MessageEvent<ServerRenderJob>) => void;
  postMessage: (data: unknown, transfer?: ArrayBuffer[]) => void;
};
scope.onmessage = async (event) => {
  try {
    const { options, format, scale, quality } = event.data;
    const rendered = renderCodeScreenshot(options);
    let output: Uint8Array<ArrayBuffer>;
    if (format === "svg" || format === "html")
      output = new TextEncoder().encode(
        format === "svg" ? rendered.svg : rendered.html,
      );
    else {
      const width = rendered.width * scale,
        height = rendered.height * scale;
      if (
        width > CODE_SCREENSHOT_MAX_DIMENSION * 2 ||
        height > CODE_SCREENSHOT_MAX_DIMENSION * 2 ||
        width * height > CODE_SCREENSHOT_MAX_PIXELS * 2
      )
        throw new Error("too_large");
      const canvas = createCanvas(width, height);
      try {
        const context = canvas.getContext("2d");
        if (format === "jpeg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
        }
        const image = await loadImage(Buffer.from(rendered.svg));
        try {
          context.drawImage(image, 0, 0, width, height);
        } finally {
          // Release the source and loader callbacks before the worker can terminate.
          image.onload = undefined;
          image.onerror = undefined;
          image.src = "";
        }
        const encoded =
          format === "png"
            ? await canvas.encode("png")
            : format === "jpeg"
              ? await canvas.encode("jpeg", quality / 100)
              : await canvas.encode("webp", quality / 100);
        output = new Uint8Array(encoded);
      } finally {
        // The client terminates this worker as soon as it receives a response.
        canvas.width = canvas.height = 1;
      }
    }
    scope.postMessage(
      {
        result: {
          output,
          width:
            rendered.width *
            (format === "svg" || format === "html" ? 1 : scale),
          height:
            rendered.height *
            (format === "svg" || format === "html" ? 1 : scale),
          lines: rendered.lines,
        },
      },
      [output.buffer],
    );
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : "render_failed",
    });
  }
};
