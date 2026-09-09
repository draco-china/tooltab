import { browserXml } from "@/features/tools/image-formats/svg";
import { validateSvg } from "@workspace/tools/image/svg";
import { imageFormat } from "@workspace/tools/image/metadata-containers";

/** Determine the image from bytes, never an archive-controlled extension or MIME. */
export function archiveImageSource(bytes: Uint8Array<ArrayBuffer>) {
  let mime: string;
  try {
    const format = imageFormat(bytes);
    mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  } catch {
    if (bytes.length > 64 * 1048576) throw new Error("preview_limit");
    const signature = new TextDecoder("latin1").decode(bytes.subarray(0, 16));
    if (signature.startsWith("BM")) mime = "image/bmp";
    else if (signature.startsWith("\0\0\x01\0")) mime = "image/x-icon";
    else if (
      signature.slice(4, 8) === "ftyp" &&
      /^(avif|avis)$/.test(signature.slice(8, 12))
    )
      mime = "image/avif";
    else {
      // Full strict XML validation also catches disguised SVG with a long whitespace prefix.
      const svg = validateSvg(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        browserXml,
      );
      return new File([svg.source], "preview.svg", { type: "image/svg+xml" });
    }
  }
  return new File([bytes], "preview", { type: mime });
}
