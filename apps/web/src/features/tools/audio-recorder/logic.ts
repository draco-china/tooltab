export const AUDIO_MAX_BYTES = 128 * 1024 * 1024;
export const AUDIO_MAX_DURATION_MS = 60 * 60 * 1000;

const preferredAudioMimeTypes = [
  'audio/mp4;codecs="mp4a.40.2"',
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export function supportedAudioMimeType(
  supports?: (mimeType: string) => boolean,
) {
  return supports
    ? (preferredAudioMimeTypes.find((mimeType) => supports(mimeType)) ?? "")
    : "";
}

export function audioExtension(mimeType: string) {
  const value = mimeType.toLowerCase();
  if (value.includes("webm")) return "webm";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("mp4") || value.includes("m4a") || value.includes("aac"))
    return "m4a";
  if (value.includes("wav") || value.includes("wave")) return "wav";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  return "webm";
}

export function recordingName(date = new Date(), mimeType = "audio/webm") {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `recording-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.${audioExtension(mimeType)}`;
}

export function recordingDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const tail = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return hours ? `${pad(hours)}:${tail}` : tail;
}

export function recordingSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function permissionDenied(error: unknown) {
  const name =
    (typeof DOMException === "function" && error instanceof DOMException) ||
    error instanceof Error
      ? error.name
      : "";
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}
