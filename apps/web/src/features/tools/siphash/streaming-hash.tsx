import { blobChunks } from "@workspace/tools/hash/browser";
import { StreamHashError, textBytes } from "@workspace/tools/hash/input";
import { useCallback } from "react";
import { ToolStreamingHashPanels } from "@/features/tools/_shared/streaming-hash/panels";
import { m } from "@/paraglide/messages.js";
import type { Algorithm, HashResult } from "./streaming-logic";
import { runStreamHash } from "./streaming-worker-client";

const errorMessages = {
  invalid_input: m["shared.legacyHashes.streamhashInvalidInput"],
  read_failed: m["shared.legacyHashes.streamhashReadFailed"],
  timeout: m["shared.legacyHashes.streamhashTimeout"],
  too_large: m["shared.legacyHashes.streamhashTooLarge"],
  worker_failed: m["shared.legacyHashes.streamhashWorkerFailed"],
  busy_error: m["shared.legacyHashes.streamhashBusyError"],
} as const;

function getErrorMessage(error: unknown) {
  return error instanceof StreamHashError
    ? errorMessages[error.code === "busy" ? "busy_error" : error.code]({})
    : m["common.streamhashFailed"]();
}

export function StreamingHashTool({
  algorithm,
  seed = 0n,
  hashKey,
  runBlob,
}: {
  algorithm: Algorithm;
  seed?: bigint | null;
  hashKey?: Uint8Array | null;
  runBlob?: (
    blob: Blob,
    signal: AbortSignal,
    progress: (n: number) => void,
  ) => Promise<HashResult>;
}) {
  const run = useCallback(
    (blob: Blob, signal: AbortSignal, progress: (bytes: number) => void) =>
      runBlob
        ? runBlob(blob, signal, progress)
        : runStreamHash(
            algorithm,
            blobChunks(blob, signal),
            signal,
            progress,
            seed ?? 0n,
            hashKey ?? undefined,
          ),
    [algorithm, hashKey, runBlob, seed],
  );

  return (
    <ToolStreamingHashPanels
      inputTitle={m["shared.siphash.input"]()}
      resultsTitle={m["shared.siphash.results"]()}
      resultsDescription={m["shared.siphash.resultsDescription"]()}
      emptyResult={m["shared.siphash.emptyResult"]()}
      isDisabled={seed === null || hashKey === null}
      encodeText={textBytes}
      run={run}
      getErrorMessage={getErrorMessage}
    />
  );
}
