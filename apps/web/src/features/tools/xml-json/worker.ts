import { workerTaskHandler } from "@/lib/worker-task";
import {
  convertXmlJson,
  XmlJsonError,
} from "@workspace/tools/encoding/xml-json";

self.onmessage = workerTaskHandler(
  {
    run: convertXmlJson,
    error: (cause) => {
      const error =
        cause instanceof XmlJsonError
          ? cause
          : new XmlJsonError("invalid_input");
      return { code: error.code, line: error.line, column: error.column };
    },
  },
  (message) => self.postMessage(message),
);
