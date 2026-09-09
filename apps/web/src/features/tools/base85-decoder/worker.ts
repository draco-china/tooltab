import type { Base85Variant } from "./logic";
import { decodeBase85 } from "./logic";

const scope = self as unknown as {
  onmessage: (
    event: MessageEvent<{ source: string; variant: Base85Variant }>,
  ) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  try {
    const bytes = decodeBase85(event.data.source, {
      variant: event.data.variant,
    });
    scope.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    // Preserve the API decoder's Error messages; only the Worker exposes codes.
    scope.postMessage({
      error:
        error instanceof Error && error.message.includes("too large")
          ? "too-large"
          : "invalid-encoding",
    });
  }
};
