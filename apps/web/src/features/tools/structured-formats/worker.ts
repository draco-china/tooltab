import { workerTaskHandler } from "@/lib/worker-task";
import {
  convertStructured,
  StructuredError,
} from "@workspace/tools/encoding/structured";

self.onmessage = workerTaskHandler(
  {
    run: convertStructured,
    error: (cause) => {
      const error =
        cause instanceof StructuredError
          ? cause
          : new StructuredError("invalid_input");
      return { code: error.code, line: error.line, column: error.column };
    },
  },
  (message) => self.postMessage(message),
);
