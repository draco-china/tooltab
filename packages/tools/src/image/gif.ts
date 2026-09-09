import { decompressFrame, parseGIF } from "gifuct-js";
import { encodeApng } from "./apng";
import {
  AnimationError,
  GIF_FRAME_LIMIT,
  GIF_FRAME_PIXEL_LIMIT,
  GIF_INPUT_LIMIT,
  GIF_OUTPUT_LIMIT,
  type AnimationFrames,
  type AnimationJob,
  type AnimationKind,
  type AnimationOptions,
  type AnimationResult,
  type AnimationRuntime,
  validateOptions,
} from "./gif-contract";

/** Walk actual GIF blocks before the decoder allocates a patch or follows subblocks. */
export function inspectGif(bytes: Uint8Array) {
  if (bytes.length > GIF_INPUT_LIMIT) throw new AnimationError("input_limit");
  const invalid = () => {
    throw new AnimationError("invalid_input");
  };
  const ascii = (start: number, n: number) =>
    String.fromCharCode(...bytes.subarray(start, start + n));
  if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(ascii(0, 6)))
    invalid();
  const u16 = (at: number) => bytes[at] | (bytes[at + 1] << 8);
  const width = u16(6),
    height = u16(8);
  if (!width || !height) invalid();
  if (width > 16384 || height > 16384 || width * height > 64 * 1048576)
    throw new AnimationError("pixel_limit");
  let at = 13,
    frames = 0,
    repeats: number | undefined;
  const skip = (n: number) => {
    if (at + n > bytes.length) invalid();
    at += n;
  };
  if (bytes[10] & 128) skip(3 * (1 << ((bytes[10] & 7) + 1)));
  const subblocks = () => {
    const first = at;
    for (;;) {
      if (at >= bytes.length) invalid();
      const n = bytes[at++];
      if (!n) return first;
      skip(n);
    }
  };
  let ended = false;
  while (at < bytes.length) {
    const code = bytes[at++];
    if (code === 0x3b) {
      ended = true;
      break;
    }
    if (code === 0x2c) {
      if (at + 9 > bytes.length) invalid();
      const x = u16(at),
        y = u16(at + 2),
        w = u16(at + 4),
        h = u16(at + 6),
        flags = bytes[at + 8];
      if (!w || !h || x + w > width || y + h > height) invalid();
      skip(9);
      if (flags & 128) skip(3 * (1 << ((flags & 7) + 1)));
      if (at >= bytes.length || bytes[at] < 2 || bytes[at] > 8) invalid();
      skip(1);
      subblocks();
      if (++frames > GIF_FRAME_LIMIT) throw new AnimationError("frame_limit");
      if (frames * width * height > GIF_FRAME_PIXEL_LIMIT)
        throw new AnimationError("pixel_limit");
    } else if (code === 0x21) {
      if (at >= bytes.length) invalid();
      const extension = bytes[at++];
      if (extension === 0xf9) {
        if (
          bytes[at] !== 4 ||
          at + 6 > bytes.length ||
          bytes[at + 5] !== 0 ||
          ((bytes[at + 1] >> 2) & 7) > 3
        )
          invalid();
        skip(6);
      } else if (extension === 0xff) {
        if (bytes[at] !== 11) invalid();
        skip(1);
        const name = ascii(at, 11);
        skip(11);
        const start = subblocks();
        if (["NETSCAPE2.0", "ANIMEXTS1.0"].includes(name)) {
          if (bytes[start] !== 3 || bytes[start + 1] !== 1) invalid();
          repeats = u16(start + 2);
        }
      } else if (extension === 0x01) {
        // Text rendering requires an unspecified font; never silently discard visual content.
        throw new AnimationError("unsupported");
      } else subblocks();
    } else invalid();
  }
  if (!ended || !frames || at !== bytes.length) invalid();
  return {
    width,
    height,
    frames,
    repeats,
    plays: repeats === undefined ? 1 : repeats === 0 ? 0 : repeats + 1,
  };
}

export function decodeGif(
  bytes: Uint8Array<ArrayBuffer>,
  options: AnimationOptions,
  kind: AnimationKind,
): AnimationFrames {
  validateOptions(kind, options);
  const meta = inspectGif(bytes);
  const width = Math.max(1, Math.round((meta.width * options.scale) / 100)),
    height = Math.max(1, Math.round((meta.height * options.scale) / 100));
  if (
    width > 16384 ||
    height > 16384 ||
    width * height > 64 * 1048576 ||
    width * height * meta.frames > GIF_FRAME_PIXEL_LIMIT
  )
    throw new AnimationError("pixel_limit");
  const parsed = parseGIF(bytes.slice().buffer);
  const images = parsed.frames.filter((f) => "image" in f);
  let canvas = new Uint8Array(meta.width * meta.height * 4);
  const background = parsed.gct?.[parsed.lsd.backgroundColorIndex] ?? [0, 0, 0];
  const first = images[0];
  const opaqueBackground =
    first && !first.gce?.extras.transparentColorGiven
      ? [...background, 255]
      : [0, 0, 0, 0];
  for (let at = 0; at < canvas.length; at += 4)
    canvas.set(opaqueBackground, at);
  const frames: Uint8Array<ArrayBuffer>[] = [],
    delays: number[] = [];
  for (const frame of images) {
    validateGifLzw(
      frame.image.data.blocks,
      frame.image.data.minCodeSize,
      frame.image.descriptor.width * frame.image.descriptor.height,
    );
    // inspectGif already verifies the complete local table when its flag is set.
    if (!frame.image.descriptor.lct.exists && !parsed.gct?.length)
      throw new AnimationError("invalid_input");
    const decoded = decompressFrame(frame, parsed.gct, true);
    if (
      !decoded ||
      decoded.pixels.length !== decoded.dims.width * decoded.dims.height ||
      decoded.pixels.some((p) => !decoded.colorTable[p])
    )
      throw new AnimationError("invalid_input");
    const before = decoded.disposalType === 3 ? canvas.slice() : undefined;
    const { left, top, width: w, height: h } = decoded.dims;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const source = (y * w + x) * 4,
          target = ((top + y) * meta.width + left + x) * 4;
        if (decoded.patch[source + 3])
          canvas.set(decoded.patch.subarray(source, source + 4), target);
      }
    frames.push(canvas.slice());
    delays.push(
      Math.max(10, Math.round((decoded.delay || 100) / options.speed)),
    );
    if (before) canvas = before;
    else if (decoded.disposalType === 2) {
      const color = frame.gce?.extras.transparentColorGiven
        ? [0, 0, 0, 0]
        : [...background, 255];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          canvas.set(color, ((top + y) * meta.width + left + x) * 4);
    }
  }
  const plays =
    options.loopMode === "infinite"
      ? 0
      : options.loopMode === "custom"
        ? options.loopCount
        : meta.plays;
  if (kind === "webp" && plays > 65535) throw new AnimationError("unsupported");
  return {
    width,
    height,
    originalWidth: meta.width,
    originalHeight: meta.height,
    frames,
    delays,
    plays,
  };
}

/** Validate the compressed stream independently of gifuct's permissive truncated-stream decoder. */
function validateGifLzw(
  data: ArrayLike<number>,
  minimum: number,
  expectedPixels: number,
) {
  const clear = 1 << minimum,
    end = clear + 1;
  // Codes are at most 12 bits; all dictionary slots exist and start at zero.
  const lengths = new Uint32Array(4096);
  for (let i = 0; i < clear; i++) lengths[i] = 1;
  let width = minimum + 1,
    next = end + 1,
    previous = -1,
    bit = 0,
    pixels = 0;
  const invalid = () => {
    throw new AnimationError("invalid_input");
  };
  for (;;) {
    if (bit + width > data.length * 8) invalid();
    let code = 0;
    for (let b = 0; b < width; b++, bit++)
      code |= ((data[bit >> 3] >> (bit & 7)) & 1) << b;
    if (code === clear) {
      width = minimum + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) {
      if (pixels !== expectedPixels) invalid();
      return;
    }
    const length =
      code < next
        ? lengths[code]
        : code === next && previous >= 0
          ? lengths[previous] + 1
          : 0;
    if (!length || (previous < 0 && code >= clear)) invalid();
    pixels += length;
    if (pixels > expectedPixels) invalid();
    if (previous >= 0 && next < 4096) {
      lengths[next++] = lengths[previous] + 1;
      if (next === 1 << width && width < 12) width++;
    }
    previous = code;
  }
}

function webpFrameCount(bytes: Uint8Array): number {
  const invalid = () => {
    throw new AnimationError("conversion_failed");
  };
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WEBP")
    return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return invalid();
  let frames = 0,
    still = false;
  for (let at = 12; at < bytes.length; ) {
    if (at + 8 > bytes.length) return invalid();
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size & 1);
    if (next > bytes.length) return invalid();
    const type = tag(at);
    if (type === "ANMF") {
      if (size < 16) return invalid();
      frames++;
    } else if (type === "VP8 " || type === "VP8L") still = true;
    at = next;
  }
  if (frames) return frames;
  if (still) return 1;
  return invalid();
}

export async function convertAnimation(
  job: AnimationJob,
  runtime: AnimationRuntime,
): Promise<AnimationResult> {
  const a = decodeGif(job.bytes, job.options, job.kind);
  if (a.width !== a.originalWidth || a.height !== a.originalHeight) {
    for (let i = 0; i < a.frames.length; i++)
      a.frames[i] = await runtime.resize(
        a.frames[i],
        a.originalWidth,
        a.originalHeight,
        a.width,
        a.height,
      );
  }
  const bytes = job.kind === "apng" ? encodeApng(a) : await runtime.webp(a);
  if (!bytes.length) throw new AnimationError("conversion_failed");
  if (bytes.length > GIF_OUTPUT_LIMIT) throw new AnimationError("output_limit");
  return {
    bytes,
    width: a.width,
    height: a.height,
    originalWidth: a.originalWidth,
    originalHeight: a.originalHeight,
    frames:
      job.kind === "apng"
        ? a.delays.reduce((count, delay) => count + Math.ceil(delay / 65535), 0)
        : webpFrameCount(bytes),
    durationMs: a.delays.reduce((n, d) => n + d, 0),
    plays: a.plays,
    originalBytes: job.bytes.length,
    outputBytes: bytes.length,
  };
}
