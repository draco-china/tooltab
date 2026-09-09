import {
  type AnalysisJob,
  analyzeText,
  TextAnalysisError,
} from "@workspace/tools/text/analysis";

self.onmessage = (event: MessageEvent<AnalysisJob>) => {
  try {
    self.postMessage({ result: analyzeText(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof TextAnalysisError ? error.code : "invalid_input",
      detail: error instanceof TextAnalysisError ? error.detail : undefined,
    });
  }
};
