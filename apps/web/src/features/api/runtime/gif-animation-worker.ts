import { convertAnimation } from "@workspace/tools/image/gif";
import {
  AnimationError,
  type AnimationJob,
} from "@workspace/tools/image/gif-contract";
import { animationRuntime } from "./gif-animation-runtime";

const scope = self as unknown as {
  onmessage: (e: MessageEvent<AnimationJob>) => void;
  postMessage(data: unknown, transfer?: Transferable[]): void;
};
scope.onmessage = async (e) => {
  try {
    const result = await convertAnimation(e.data, animationRuntime);
    scope.postMessage({ result }, [result.bytes.buffer]);
  } catch (error) {
    scope.postMessage({
      error: error instanceof AnimationError ? error.code : "conversion_failed",
    });
  }
};
