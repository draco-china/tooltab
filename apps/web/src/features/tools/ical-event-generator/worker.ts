import { generateIcal } from "@workspace/tools/time/ical";
import {
  IcalError,
  type IcalOptions,
} from "@workspace/tools/time/ical-contract";

self.onmessage = (
  event: MessageEvent<{ options: IcalOptions; nowMs: number }>,
) => {
  try {
    self.postMessage({
      result: generateIcal(event.data.options, event.data.nowMs),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof IcalError ? error.code : "generation_failed",
    });
  }
};
