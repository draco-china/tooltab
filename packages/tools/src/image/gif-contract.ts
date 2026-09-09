export const GIF_INPUT_LIMIT = 64 * 1048576;
export const GIF_OUTPUT_LIMIT = 256 * 1048576;
export const GIF_FRAME_PIXEL_LIMIT = 128 * 1024 * 1024;
export const GIF_FRAME_LIMIT = 2000;

export type AnimationKind = "webp" | "apng";
export type AnimationOptions = {
  scale: number;
  speed: number;
  loopMode: "inherit" | "infinite" | "custom";
  loopCount: number;
};
export const animationDefaults: AnimationOptions = {
  scale: 100,
  speed: 1,
  loopMode: "inherit",
  loopCount: 1,
};
export type AnimationErrorCode =
  | "invalid_input"
  | "invalid_options"
  | "input_limit"
  | "output_limit"
  | "pixel_limit"
  | "frame_limit"
  | "unsupported"
  | "timeout"
  | "busy"
  | "artifact_required"
  | "conversion_failed";
export class AnimationError extends Error {
  constructor(public code: AnimationErrorCode) {
    super(code);
    this.name = "AnimationError";
  }
}

export function validateOptions(kind: AnimationKind, o: AnimationOptions) {
  if (
    !["webp", "apng"].includes(kind) ||
    !Number.isInteger(o.scale) ||
    o.scale < 10 ||
    o.scale > 400 ||
    !Number.isFinite(o.speed) ||
    o.speed < 0.25 ||
    o.speed > 4 ||
    !["inherit", "infinite", "custom"].includes(o.loopMode) ||
    !Number.isInteger(o.loopCount) ||
    o.loopCount < 1 ||
    o.loopCount > (kind === "webp" ? 1000 : 999)
  )
    throw new AnimationError("invalid_options");
}

export type AnimationFrames = {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  frames: Uint8Array<ArrayBuffer>[];
  delays: number[];
  plays: number;
};
export type AnimationJob = {
  kind: AnimationKind;
  bytes: Uint8Array<ArrayBuffer>;
  options: AnimationOptions;
};
export type AnimationResult = {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  frames: number;
  durationMs: number;
  plays: number;
  originalBytes: number;
  outputBytes: number;
};
export type AnimationRuntime = {
  resize(
    frame: Uint8Array<ArrayBuffer>,
    width: number,
    height: number,
    targetWidth: number,
    targetHeight: number,
  ): Promise<Uint8Array<ArrayBuffer>>;
  webp(animation: AnimationFrames): Promise<Uint8Array<ArrayBuffer>>;
};
