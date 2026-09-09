export const ARCHIVE_INPUT_LIMIT = 128 * 1048576;
export const ARCHIVE_EXPANDED_LIMIT = 512 * 1048576;
export const ARCHIVE_ENTRY_LIMIT = 100000;
export const ARCHIVE_PREVIEW_LIMIT = 1048576;
export type ArchiveFormat = "zip" | "tar" | "gz" | "tgz";
export type ArchiveEntryKind = "file" | "directory" | "symlink" | "other";
export type ArchiveEntry = {
  id: string;
  path: string;
  kind: ArchiveEntryKind;
  size: number;
  compressedSize: number | null;
  modifiedAt: string | null;
  unsafePath: boolean;
  encrypted: boolean;
  linkTarget?: string;
};
export type ArchiveCode =
  | "invalid_input"
  | "unsupported"
  | "input_limit"
  | "expanded_limit"
  | "entry_limit"
  | "entry_not_found"
  | "file_only"
  | "encrypted"
  | "preview_limit"
  | "timeout"
  | "busy"
  | "artifact_required"
  | "read_failed";
export class ArchiveError extends Error {
  constructor(public code: ArchiveCode) {
    super(code);
    this.name = "ArchiveError";
  }
}
export type ArchiveJob = {
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  action: "list" | "extract" | "preview";
  entryId?: string;
};
export type ArchiveResult = {
  format: ArchiveFormat;
  entries: ArchiveEntry[];
  archiveBytes: number;
  uncompressedBytes: number;
  bytes?: Uint8Array<ArrayBuffer>;
  previewText?: string;
};
export function pathIsUnsafe(path: string) {
  return (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-z]:/i.test(path) ||
    path.replaceAll("\\", "/").split("/").includes("..") ||
    Array.from(path).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  );
}
export function downloadName(path: string) {
  const leaf =
    path.replaceAll("\\", "/").split("/").filter(Boolean).pop() ||
    "archive-entry.bin";
  const name = Array.from(leaf)
    .map((c) =>
      c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '<>:"|?*'.includes(c)
        ? "_"
        : c,
    )
    .join("");
  return name === "." || name === ".." ? "archive-entry.bin" : name;
}
export function archiveFormat(
  bytes: Uint8Array,
  filename: string,
): ArchiveFormat {
  if (bytes.length > ARCHIVE_INPUT_LIMIT) throw new ArchiveError("input_limit");
  if (
    bytes.length >= 4 &&
    bytes[0] === 80 &&
    bytes[1] === 75 &&
    ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6))
  )
    return "zip";
  if (bytes.length >= 2 && bytes[0] === 31 && bytes[1] === 139)
    return /\.(tgz|tar\.gz)$/i.test(filename) ? "tgz" : "gz";
  if (
    bytes.length >= 512 &&
    (new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar" ||
      filename.toLowerCase().endsWith(".tar"))
  )
    return "tar";
  throw new ArchiveError("unsupported");
}
export type ArchiveRow = {
  key: string;
  name: string;
  directory: string | null;
  entry: ArchiveEntry | null;
};
/** Navigation is a virtual tree only; archive paths never become host filesystem paths. */
export function folderRows(
  entries: ArchiveEntry[],
  directory: string,
  query: string,
) {
  const rows: ArchiveRow[] = [],
    folders = new Set<string>();
  for (const entry of entries) {
    if (entry.unsafePath) {
      if (!directory)
        rows.push({ key: entry.id, name: entry.path, directory: null, entry });
      continue;
    }
    const path = entry.path.replaceAll("\\", "/");
    if (!path.startsWith(directory)) continue;
    const remaining = path.slice(directory.length),
      slash = remaining.indexOf("/");
    if (slash >= 0) {
      const name = remaining.slice(0, slash);
      if (!name) continue;
      const child = `${directory}${name}/`;
      if (!folders.has(child)) {
        folders.add(child);
        rows.push({
          key: `folder:${child}`,
          name,
          directory: child,
          entry:
            entry.kind === "directory" && remaining.slice(slash + 1) === ""
              ? entry
              : null,
        });
      }
    } else if (remaining)
      rows.push({ key: entry.id, name: remaining, directory: null, entry });
  }
  return rows
    .filter((r) =>
      r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!b.directory) - Number(!!a.directory) ||
        a.name.localeCompare(b.name),
    );
}
export function previewKind(path: string): "text" | "image" | "pdf" | null {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (
    [
      "bash",
      "conf",
      "css",
      "csv",
      "html",
      "ini",
      "js",
      "json",
      "jsx",
      "log",
      "md",
      "mjs",
      "plist",
      "sh",
      "sql",
      "toml",
      "ts",
      "tsx",
      "txt",
      "xml",
      "yaml",
      "yml",
      "zsh",
      "php",
      "py",
      "rb",
      "rs",
    ].includes(extension)
  )
    return "text";
  if (
    [
      "avif",
      "bmp",
      "gif",
      "ico",
      "jpeg",
      "jpg",
      "png",
      "svg",
      "tif",
      "tiff",
      "webp",
    ].includes(extension)
  )
    return "image";
  return extension === "pdf" ? "pdf" : null;
}
