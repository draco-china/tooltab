import { zlibSync } from "fflate";
import {
  AnimationError,
  GIF_FRAME_LIMIT,
  GIF_OUTPUT_LIMIT,
  type AnimationFrames,
} from "./gif-contract";

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function pngCrc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/** Full RGBA source frames: simple lossless PNG packing, with no palette quantization. */
export function encodeApng(
  animation: AnimationFrames,
): Uint8Array<ArrayBuffer> {
  const frames: Uint8Array<ArrayBuffer>[] = [],
    delays: number[] = [];
  for (let i = 0; i < animation.frames.length; i++) {
    let delay = animation.delays[i];
    do {
      const part = Math.min(65535, delay);
      frames.push(animation.frames[i]);
      delays.push(part);
      delay -= part;
      if (frames.length > GIF_FRAME_LIMIT)
        throw new AnimationError("frame_limit");
    } while (delay > 0);
  }
  const parts: Uint8Array<ArrayBuffer>[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  ];
  let total = 8;
  const chunk = (type: string, data: Uint8Array) => {
    const bytes = new Uint8Array(data.length + 12),
      view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    bytes.set(new TextEncoder().encode(type), 4);
    bytes.set(data, 8);
    view.setUint32(data.length + 8, pngCrc(bytes.subarray(4, data.length + 8)));
    total += bytes.length;
    if (total > GIF_OUTPUT_LIMIT) throw new AnimationError("output_limit");
    parts.push(bytes);
  };
  const header = new Uint8Array(13),
    hv = new DataView(header.buffer);
  hv.setUint32(0, animation.width);
  hv.setUint32(4, animation.height);
  header[8] = 8;
  header[9] = 6;
  chunk("IHDR", header);
  const control = new Uint8Array(8),
    cv = new DataView(control.buffer);
  cv.setUint32(0, frames.length);
  cv.setUint32(4, animation.plays);
  chunk("acTL", control);
  let sequence = 0;
  for (let i = 0; i < frames.length; i++) {
    const frameControl = new Uint8Array(26),
      v = new DataView(frameControl.buffer);
    v.setUint32(0, sequence++);
    v.setUint32(4, animation.width);
    v.setUint32(8, animation.height);
    v.setUint16(20, delays[i]);
    v.setUint16(22, 1000);
    chunk("fcTL", frameControl);
    const stride = animation.width * 4;
    const scanlines = new Uint8Array((stride + 1) * animation.height);
    for (let y = 0; y < animation.height; y++)
      scanlines.set(
        frames[i].subarray(y * stride, (y + 1) * stride),
        y * (stride + 1) + 1,
      );
    const compressed = zlibSync(scanlines, { level: 6 });
    if (i === 0) chunk("IDAT", compressed);
    else {
      const data = new Uint8Array(compressed.length + 4);
      new DataView(data.buffer).setUint32(0, sequence++);
      data.set(compressed, 4);
      chunk("fdAT", data);
    }
  }
  chunk("IEND", new Uint8Array());
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
