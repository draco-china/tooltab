import { runUtility, TextUtilityError, type UtilityJob } from "./logic";

self.onmessage = async (event: MessageEvent<UtilityJob>) => {
  try {
    const result = await runUtility(event.data);
    if (result.kind === "audio")
      self.postMessage({ result }, { transfer: [result.bytes.buffer] });
    else self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof TextUtilityError ? error.code : "invalid_input",
    });
  }
};
