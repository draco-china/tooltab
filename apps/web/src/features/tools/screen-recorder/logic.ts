export const SCREEN_MAX_BYTES = 256 * 1024 * 1024;
export const SCREEN_MAX_DURATION_MS = 2 * 60 * 60 * 1000;
export const screenMimeTypes = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function supportedScreenMime(supports?: (mime: string) => boolean) {
  return supports ? (screenMimeTypes.find(supports) ?? "") : "";
}
export function screenExtension(mime: string) {
  const value = mime.toLowerCase();
  if (value.includes("mp4")) return "mp4";
  if (value.includes("matroska") || value.includes("mkv")) return "mkv";
  return "webm";
}
export function screenDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const tail = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return hours ? `${pad(hours)}:${tail}` : tail;
}
export function screenSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
export function screenName(date = new Date(), mime = "video/webm") {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `screen-recording-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.${screenExtension(mime)}`;
}
export function screenDownloadName(value: string, mime: string) {
  const clean = value
    .trim()
    .replace(/\.(?:webm|mkv|mp4|mov)$/i, "")
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 120);
  return `${clean || "screen-recording"}.${screenExtension(mime)}`;
}
export function captureCancelled(error: unknown) {
  const known =
    (typeof DOMException === "function" && error instanceof DOMException) ||
    error instanceof Error;
  return (
    known &&
    ["NotAllowedError", "PermissionDeniedError", "AbortError"].includes(
      error.name,
    )
  );
}
