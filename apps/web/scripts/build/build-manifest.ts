import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Explicit opt-in capture, outside the deployed public artifact tree. */
export async function captureProductionManifest(
  manifest: unknown[],
  destination?: string,
) {
  if (!destination) return;
  const path = resolve(destination);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2));
}
