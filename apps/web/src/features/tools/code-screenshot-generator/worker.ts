/// <reference lib="webworker" />
import {
  type CodeScreenshotOptions,
  renderCodeScreenshot,
} from "@workspace/tools/image/code-screenshot";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (
  event: MessageEvent<{ id: number; options: CodeScreenshotOptions }>,
) => {
  try {
    scope.postMessage({
      id: event.data.id,
      result: renderCodeScreenshot(event.data.options),
    });
  } catch (error) {
    scope.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "render_failed",
    });
  }
};
