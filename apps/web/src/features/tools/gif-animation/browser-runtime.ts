import wasmUrl from "@libwebp-wasm/img2webp/es/img2webp.wasm?url";
import type { AnimationRuntime } from "@workspace/tools/image/gif-contract";
import { AnimationError } from "@workspace/tools/image/gif-contract";

function canvas(frame: Uint8Array<ArrayBuffer>, width: number, height: number) {
  const c = new OffscreenCanvas(width, height),
    ctx = c.getContext("2d");
  if (!ctx) throw new AnimationError("unsupported");
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(frame.buffer), width, height),
    0,
    0,
  );
  return c;
}
export const browserAnimationRuntime: AnimationRuntime = {
  async resize(frame, width, height, targetWidth, targetHeight) {
    const original = canvas(frame, width, height),
      target = new OffscreenCanvas(targetWidth, targetHeight),
      ctx = target.getContext("2d");
    if (!ctx) throw new AnimationError("unsupported");
    ctx.drawImage(original, 0, 0, targetWidth, targetHeight);
    return new Uint8Array(
      ctx.getImageData(0, 0, targetWidth, targetHeight).data.buffer,
    );
  },
  async webp(animation) {
    const { Img2Webp, runImg2Webp } = await import("@libwebp-wasm/img2webp");
    const module = await Img2Webp({
      locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
    });
    const names: string[] = [],
      args = [
        "-min_size",
        "-loop",
        String(animation.plays),
        "-lossless",
        "-q",
        "100",
        "-m",
        "6",
      ];
    try {
      for (let i = 0; i < animation.frames.length; i++) {
        const name = `frame-${i}.png`;
        const png = await canvas(
          animation.frames[i],
          animation.width,
          animation.height,
        ).convertToBlob({ type: "image/png" });
        module.FS.writeFile(name, new Uint8Array(await png.arrayBuffer()));
        names.push(name);
        args.push("-d", String(animation.delays[i]), name);
      }
      args.push("-o", "output.webp");
      runImg2Webp(module, "_main", ...args);
      return new Uint8Array(module.FS.readFile("output.webp"));
    } finally {
      for (const name of [...names, "output.webp"]) {
        try {
          module.FS.unlink(name);
        } catch {}
      }
    }
  },
};
