import {
  exportOptions,
  type ImageFormat,
} from "@workspace/tools/image/options";
import {
  outputDimensions,
  validateSvg,
  svgViewport,
  type SvgXmlRuntime,
} from "@workspace/tools/image/svg";
export type RasterFormat = ImageFormat;
export type SvgImageOptions = {
  width: number;
  height: number;
  scale: number;
  format: RasterFormat;
  quality: number;
  transparent: boolean;
  background: string;
};

export const browserXml: SvgXmlRuntime = {
  parse: (source) => new DOMParser().parseFromString(source, "image/svg+xml"),
  serialize: (root) => new XMLSerializer().serializeToString(root as Element),
};
export async function rasterizeSvg(
  source: string,
  options: SvgImageOptions,
  signal?: AbortSignal,
) {
  const size = outputDimensions(options.width, options.height, options.scale);
  const output = exportOptions(options.format, options.quality * 100);
  if (!/^#[\da-f]{6}$/i.test(options.background)) throw new Error("error");
  signal?.throwIfAborted();
  const svg = validateSvg(source, browserXml);
  const url = URL.createObjectURL(
    new Blob(
      [
        svgViewport(
          svg.source,
          options.width,
          options.height,
          options.scale,
          browserXml,
        ),
      ],
      { type: "image/svg+xml" },
    ),
  );
  const img = new Image();
  const canvas = document.createElement("canvas");
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        signal?.removeEventListener("abort", abort);
        img.src = "";
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      img.onload = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      img.onerror = () => {
        signal?.removeEventListener("abort", abort);
        reject(new Error("decodeError"));
      };
      img.src = url;
    });
    signal?.throwIfAborted();
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvasUnsupported");
    if (!options.transparent || options.format === "jpeg") {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const mime = output.type;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("unsupported")),
        mime,
        output.quality,
      ),
    );
    signal?.throwIfAborted();
    if (blob.type !== mime) throw new Error("unsupported");
    return blob;
  } finally {
    img.onload = null;
    img.onerror = null;
    img.src = "";
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
