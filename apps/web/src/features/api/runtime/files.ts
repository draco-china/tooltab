import { MAX_HASH_FILE_BYTES } from "@workspace/tools/hash/sha-input";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export class FileAccessError extends Error {
  constructor(
    public readonly code:
      | "PATH_NOT_ALLOWED"
      | "FILE_TOO_LARGE"
      | "FILE_CHANGED"
      | "READ_FAILED",
  ) {
    super(code);
  }
}
const inside = (root: string, path: string) => {
  const rest = relative(root, path);
  return (
    rest === "" ||
    (!isAbsolute(rest) && rest !== ".." && !rest.startsWith(`..${sep}`))
  );
};
export async function resolveInputRoots(paths: readonly string[]) {
  return Promise.all(
    paths.map(async (path) => {
      if (!isAbsolute(path))
        throw new Error("Input roots must be absolute directories");
      const canonical = await realpath(path);
      if (!(await stat(canonical)).isDirectory())
        throw new Error("Input roots must be directories");
      return canonical;
    }),
  );
}
export async function* streamAuthorizedFile(
  inputPath: string,
  roots: readonly string[],
  signal?: AbortSignal,
  limit = Number.MAX_SAFE_INTEGER,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (!isAbsolute(inputPath) || inputPath.includes("\0") || roots.length === 0)
    throw new FileAccessError("PATH_NOT_ALLOWED");
  let canonical: string;
  try {
    canonical = await realpath(resolve(inputPath));
  } catch {
    throw new FileAccessError("READ_FAILED");
  }
  if (!roots.some((root) => inside(root, canonical)))
    throw new FileAccessError("PATH_NOT_ALLOWED");
  const handle = await open(
    canonical,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => {
    throw new FileAccessError("READ_FAILED");
  });
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new FileAccessError("PATH_NOT_ALLOWED");
    if (!Number.isSafeInteger(before.size) || before.size > limit)
      throw new FileAccessError("FILE_TOO_LARGE");
    const confirmed = await realpath(inputPath);
    if (!roots.some((root) => inside(root, confirmed)))
      throw new FileAccessError("PATH_NOT_ALLOWED");
    const selected = await stat(confirmed);
    if (selected.dev !== before.dev || selected.ino !== before.ino)
      throw new FileAccessError("FILE_CHANGED");
    // Fixed-size chunks preserve file capacity without whole-file allocation.
    let offset = 0;
    while (offset < before.size) {
      signal?.throwIfAborted();
      const chunk = new Uint8Array(Math.min(65536, before.size - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      if (!bytesRead) throw new FileAccessError("FILE_CHANGED");
      offset += bytesRead;
      yield chunk.subarray(0, bytesRead);
    }
    const extra = await handle.read(new Uint8Array(1), 0, 1, offset);
    const after = await handle.stat();
    if (
      extra.bytesRead ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new FileAccessError("FILE_CHANGED");
    signal?.throwIfAborted();
  } catch (cause) {
    signal?.throwIfAborted();
    if (
      cause instanceof FileAccessError ||
      (cause instanceof Error && cause.name === "AbortError")
    )
      throw cause;
    throw new FileAccessError("READ_FAILED");
  } finally {
    await handle.close();
  }
}

export async function readAuthorizedFile(
  inputPath: string,
  roots: readonly string[],
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of streamAuthorizedFile(
    inputPath,
    roots,
    signal,
    MAX_HASH_FILE_BYTES,
  )) {
    chunks.push(chunk);
    length += chunk.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
