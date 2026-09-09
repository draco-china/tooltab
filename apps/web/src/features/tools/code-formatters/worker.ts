import { executeFormatter } from "./logic";
import { FormatterError } from "@workspace/tools/format/contract";
import type { FormatterJob } from "./types";

self.onmessage = async (event: MessageEvent<FormatterJob>) => {
  try {
    self.postMessage({ result: await executeFormatter(event.data) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof FormatterError
          ? {
              code: error.code,
              message: error.message,
              line: error.line,
              column: error.column,
            }
          : { code: "invalid_options", message: "Invalid formatting options" },
    });
  }
};
