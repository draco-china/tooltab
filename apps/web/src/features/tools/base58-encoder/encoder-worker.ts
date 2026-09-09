import { encodeBase, BaseEncodingError } from "@workspace/tools/encoding/base";
import type { Base58AlphabetKey } from "@workspace/tools/encoding/base58";

type WorkerRequest = {
  bytes: Uint8Array<ArrayBuffer>;
  alphabet: Base58AlphabetKey;
};

const scope = self as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async (event) => {
  try {
    scope.postMessage({
      encoded: await encodeBase(event.data.bytes, "base58", true, {
        alphabet: event.data.alphabet,
      }),
    });
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof BaseEncodingError && error.code === "too-large"
          ? "too-large"
          : "unsupported",
    });
  }
};
