import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";
import type { AnimationRuntime } from "@workspace/tools/image/gif-contract";

const require = createRequire(import.meta.url);

async function createImg2Webp() {
  const img2webpWasm = `data:application/wasm;base64,${Buffer.from(
    readFileSync(require.resolve("@libwebp-wasm/img2webp/es/img2webp.wasm")),
  ).toString("base64")}`;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const needsWindow = typeof globalThis.window !== "object";
  if (needsWindow)
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
      writable: true,
    });
  try {
    const { Img2Webp } = await import("@libwebp-wasm/img2webp");
    return await Img2Webp({
      locateFile: (path) => (path.endsWith(".wasm") ? img2webpWasm : path),
    });
  } finally {
    if (needsWindow) {
      if (originalWindow)
        Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  }
}

export const animationRuntime: AnimationRuntime = {
  async resize(frame, width, height, targetWidth, targetHeight) {
    return new Uint8Array(
      await sharp(frame, { raw: { width, height, channels: 4 } })
        .resize(targetWidth, targetHeight, { fit: "fill" })
        .raw()
        .toBuffer(),
    );
  },
  async webp(animation) {
    const module = await createImg2Webp();
    const { runImg2Webp } = await import("@libwebp-wasm/img2webp");
    const names: string[] = [];
    const args = [
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
        module.FS.writeFile(
          name,
          await sharp(animation.frames[i], {
            raw: {
              width: animation.width,
              height: animation.height,
              channels: 4,
            },
          })
            .png()
            .toBuffer(),
        );
        names.push(name);
        args.push("-d", String(animation.delays[i]), name);
      }
      args.push("-o", "output.webp");
      runImg2Webp(module, "_main", ...args);
      return new Uint8Array(module.FS.readFile("output.webp"));
    } finally {
      for (const name of [...names, "output.webp"])
        try {
          module.FS.unlink(name);
        } catch {}
    }
  },
};
