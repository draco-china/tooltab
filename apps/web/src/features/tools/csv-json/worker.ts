import {
  CsvJsonError,
  type CsvJsonJob,
  convertCsvJson,
} from "@workspace/tools/encoding/csv-json";

self.onmessage = (event: MessageEvent<CsvJsonJob>) => {
  try {
    self.postMessage({ result: convertCsvJson(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof CsvJsonError ? error.code : "invalid_input",
      row: error instanceof CsvJsonError ? error.row : undefined,
    });
  }
};
