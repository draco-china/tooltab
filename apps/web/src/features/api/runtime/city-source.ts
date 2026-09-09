import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { MAX_BYTES, StreamHashError } from "@workspace/tools/hash/input";
import { FileAccessError } from "./files";
import { runServiceStreamHash } from "./legacy-hashes";

const inside = (root: string, path: string) => {
  const rest = relative(root, path);
  return (
    rest === "" ||
    (!isAbsolute(rest) && rest !== ".." && !rest.startsWith(`..${sep}`))
  );
};
/** The descriptor stays open across suffix initialization, sequential reads and final identity checks. */
export async function runCityFile(
  path: string,
  seed: bigint | null,
  signal: AbortSignal,
  roots: readonly string[] | null,
) {
  signal.throwIfAborted();
  if (!isAbsolute(path) || path.includes("\0"))
    throw new FileAccessError("PATH_NOT_ALLOWED");
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch {
    throw new FileAccessError("READ_FAILED");
  }
  if (roots !== null && !roots.some((root) => inside(root, canonical)))
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
    if (!Number.isSafeInteger(before.size) || before.size > MAX_BYTES)
      throw new FileAccessError("FILE_TOO_LARGE");
    const confirmed = await realpath(path);
    if (roots !== null && !roots.some((root) => inside(root, confirmed)))
      throw new FileAccessError("PATH_NOT_ALLOWED");
    const selected = await stat(confirmed);
    if (selected.dev !== before.dev || selected.ino !== before.ino)
      throw new FileAccessError("FILE_CHANGED");
    async function readAt(offset: number, length: number) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(length);
      let done = 0;
      while (done < length) {
        signal.throwIfAborted();
        const read = await handle.read(
          bytes,
          done,
          length - done,
          offset + done,
        );
        if (!read.bytesRead) throw new FileAccessError("FILE_CHANGED");
        done += read.bytesRead;
      }
      return bytes;
    }
    const first = await readAt(0, Math.min(8, before.size)),
      last = await readAt(
        Math.max(0, before.size - 64),
        Math.min(64, before.size),
      );
    async function* chunks() {
      for (let offset = 0; offset < before.size; offset += 262144)
        yield await readAt(offset, Math.min(262144, before.size - offset));
    }
    const result = await runServiceStreamHash(
      "CityHash64",
      chunks(),
      signal,
      undefined,
      0n,
      undefined,
      { length: before.size, first, last, seed },
    );
    const after = await handle.stat();
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.ino !== before.ino ||
      after.dev !== before.dev
    )
      throw new FileAccessError("FILE_CHANGED");
    signal.throwIfAborted();
    return result;
  } catch (cause) {
    if (
      cause instanceof FileAccessError ||
      cause instanceof StreamHashError ||
      (cause instanceof Error && cause.name === "AbortError")
    )
      throw cause;
    throw new FileAccessError("READ_FAILED");
  } finally {
    await handle.close();
  }
}
