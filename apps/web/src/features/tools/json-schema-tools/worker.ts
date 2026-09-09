import { executeSchemaTool, type SchemaJob } from "./jobs";
import { SchemaToolError } from "@workspace/tools/json/schema-contract";

self.onmessage = (event: MessageEvent<SchemaJob>) => {
  try {
    self.postMessage({ result: executeSchemaTool(event.data) });
  } catch (error) {
    self.postMessage({
      error: {
        code: error instanceof SchemaToolError ? error.code : "invalid_options",
      },
    });
  }
};
