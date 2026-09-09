import {
  hashKeccakSource,
  type KeccakJob,
  KeccakPageError,
} from "@workspace/tools/hash/keccak-browser";

self.onmessage = async (event: MessageEvent<KeccakJob>) => {
  try {
    const result = await hashKeccakSource(event.data);
    self.postMessage({ result: result.buffer }, [result.buffer]);
  } catch (error) {
    self.postMessage({
      error: error instanceof KeccakPageError ? error.code : "digest-failed",
    });
  }
};
