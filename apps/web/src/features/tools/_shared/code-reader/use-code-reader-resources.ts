import { useCallback, useEffect, useRef, useState } from "react";

const cameraScanMaxEdge = 960;
const cameraScanInterval = 100;

export type CodeReaderCameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "unsupported"
  | "permission-denied"
  | "error";

type PixelReader<Result> = (
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  signal: AbortSignal,
) => Promise<Result | null>;

export function useCodeReaderResources<Result>({
  pixelLimit,
  readPixels,
  onCameraStart,
  onCameraResult,
  frameError,
}: {
  pixelLimit: number;
  readPixels: PixelReader<Result>;
  onCameraStart: () => void;
  onCameraResult: (result: Result) => void;
  frameError?: string;
}) {
  const [cameraStatus, setCameraStatus] =
    useState<CodeReaderCameraStatus>("idle");
  const [cameraError, setCameraError] = useState("");
  const revision = useRef(0);
  const task = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCanvas = useRef<HTMLCanvasElement | null>(null);

  const abortTask = useCallback(() => {
    revision.current += 1;
    task.current?.abort();
    task.current = null;
  }, []);

  const startTask = useCallback(() => {
    abortTask();
    const controller = new AbortController();
    task.current = controller;
    return controller;
  }, [abortTask]);

  const isCurrentTask = useCallback(
    (controller: AbortController) => task.current === controller,
    [],
  );

  const finishTask = useCallback((controller: AbortController) => {
    if (task.current === controller) task.current = null;
  }, []);

  const releaseCamera = useCallback(() => {
    abortTask();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    if (scanCanvas.current)
      scanCanvas.current.width = scanCanvas.current.height = 0;
  }, [abortTask]);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setCameraStatus((current) =>
      current === "unsupported" ? "unsupported" : "idle",
    );
  }, [releaseCamera]);

  const markCameraUnsupported = useCallback(() => {
    setCameraStatus("unsupported");
  }, []);

  useEffect(() => {
    if (typeof navigator.mediaDevices?.getUserMedia !== "function")
      setCameraStatus("unsupported");
    return () => releaseCamera();
  }, [releaseCamera]);

  const startCamera = useCallback(async () => {
    if (cameraStatus === "starting" || cameraStatus === "scanning") return;
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setCameraStatus("unsupported");
      return;
    }
    releaseCamera();
    const epoch = revision.current;
    setCameraStatus("starting");
    setCameraError("");
    onCameraStart();
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      if (revision.current !== epoch) {
        acquired.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      stream.current = acquired;
      const element = video.current;
      if (!element) {
        stopCamera();
        return;
      }
      element.srcObject = acquired;
      await element.play();
      if (revision.current !== epoch) return;
      setCameraStatus("scanning");
      const controller = new AbortController();
      task.current = controller;
      const capture = async () => {
        if (controller.signal.aborted || !video.current) return;
        const sourceWidth = video.current.videoWidth;
        const sourceHeight = video.current.videoHeight;
        if (!sourceWidth || !sourceHeight) {
          timer.current = setTimeout(() => void capture(), cameraScanInterval);
          return;
        }
        const scale = Math.min(
          1,
          cameraScanMaxEdge / Math.max(sourceWidth, sourceHeight),
        );
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const fail = () => {
          releaseCamera();
          setCameraStatus("error");
          setCameraError(frameError ?? "");
        };
        if (width * height > pixelLimit) {
          fail();
          return;
        }
        let context: CanvasRenderingContext2D | null = null;
        try {
          let canvas = scanCanvas.current;
          if (!canvas) {
            canvas = document.createElement("canvas");
            scanCanvas.current = canvas;
          }
          canvas.width = width;
          canvas.height = height;
          context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) {
            fail();
            return;
          }
          context.drawImage(video.current, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height);
          let decoded: Result | null;
          try {
            decoded = await readPixels(
              pixels.data,
              width,
              height,
              controller.signal,
            );
          } finally {
            pixels.data.fill(0);
          }
          if (controller.signal.aborted) return;
          if (decoded) {
            onCameraResult(decoded);
            releaseCamera();
            setCameraStatus("idle");
            return;
          }
          timer.current = setTimeout(() => void capture(), cameraScanInterval);
        } catch {
          if (!controller.signal.aborted) fail();
        } finally {
          context?.clearRect(0, 0, width, height);
        }
      };
      void capture();
    } catch (cause) {
      if (revision.current !== epoch) return;
      releaseCamera();
      setCameraError("");
      setCameraStatus(
        cause instanceof DOMException &&
          (cause.name === "NotAllowedError" ||
            cause.name === "PermissionDeniedError")
          ? "permission-denied"
          : "error",
      );
    }
  }, [
    cameraStatus,
    frameError,
    onCameraResult,
    onCameraStart,
    pixelLimit,
    readPixels,
    releaseCamera,
    stopCamera,
  ]);

  return {
    abortTask,
    cameraError,
    cameraStatus,
    finishTask,
    isCurrentTask,
    markCameraUnsupported,
    startCamera,
    startTask,
    stopCamera,
    video,
  };
}
