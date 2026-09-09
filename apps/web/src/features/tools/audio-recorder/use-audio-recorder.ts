import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_MS,
  permissionDenied,
  recordingName,
  supportedAudioMimeType,
} from "./logic";

export type RecorderStatus = "idle" | "recording" | "paused";
export type RecorderError = "permission" | "failed" | "limit";
export type Recording = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  name: string;
  url: string;
};

export function audioRecordingSupported() {
  return Boolean(
    typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder === "function",
  );
}

export function useAudioRecorder() {
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<RecorderError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bytes = useRef(0);
  const activeElapsed = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const objectUrl = useRef("");
  const alive = useRef(true);
  const request = useRef(0);
  const forcedError = useRef<RecorderError | null>(null);
  const downloadName = useRef("recording.webm");

  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
  }, []);

  const syncElapsed = useCallback(() => {
    if (startedAt.current) {
      activeElapsed.current += Math.max(0, Date.now() - startedAt.current);
    }
    startedAt.current = 0;
    setElapsed(activeElapsed.current);
  }, []);

  const stop = useCallback(() => {
    const current = recorder.current;
    if (!current || current.state === "inactive") return;
    if (current.state === "recording") syncElapsed();
    stopTimer();
    current.stop();
  }, [stopTimer, syncElapsed]);

  useEffect(() => {
    alive.current = true;
    setSupported(audioRecordingSupported());
    return () => {
      alive.current = false;
      // Invalidate the latest async generation at cleanup, not the generation captured at mount.
      request.current++;
      stopTimer();
      const current = recorder.current;
      if (current) {
        current.ondataavailable = null;
        current.onerror = null;
        current.onpause = null;
        current.onresume = null;
        current.onstart = null;
        current.onstop = null;
        if (current.state !== "inactive") current.stop();
      }
      recorder.current = null;
      stopTracks();
      revokeObjectUrl();
    };
  }, [revokeObjectUrl, stopTimer, stopTracks]);

  const startTimer = useCallback(() => {
    stopTimer();
    startedAt.current = Date.now();
    timer.current = window.setInterval(() => {
      const value = activeElapsed.current + Date.now() - startedAt.current;
      setElapsed(value);
      if (value >= AUDIO_MAX_DURATION_MS) {
        forcedError.current = "limit";
        stop();
      }
    }, 200);
  }, [stop, stopTimer]);

  const start = useCallback(async () => {
    if (preparing || status !== "idle") return;
    if (!audioRecordingSupported()) {
      setSupported(false);
      return;
    }

    const token = ++request.current;
    setPreparing(true);
    setError(null);
    chunks.current = [];
    bytes.current = 0;
    activeElapsed.current = 0;
    setElapsed(0);
    forcedError.current = null;

    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!alive.current || token !== request.current) {
        acquired.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }

      stream.current = acquired;
      const mimeType = supportedAudioMimeType(
        MediaRecorder.isTypeSupported?.bind(MediaRecorder),
      );
      let instance: MediaRecorder;
      try {
        instance = mimeType
          ? new MediaRecorder(acquired, { mimeType })
          : new MediaRecorder(acquired);
      } catch {
        instance = new MediaRecorder(acquired);
      }

      recorder.current = instance;
      downloadName.current = recordingName(
        new Date(),
        instance.mimeType || mimeType || "audio/webm",
      );
      instance.onstart = () => {
        revokeObjectUrl();
        setRecording(null);
        setStatus("recording");
        startTimer();
      };
      instance.onpause = () => {
        syncElapsed();
        stopTimer();
        setStatus("paused");
      };
      instance.onresume = () => {
        setStatus("recording");
        startTimer();
      };
      instance.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.current.push(event.data);
        bytes.current += event.data.size;
        if (bytes.current > AUDIO_MAX_BYTES) {
          forcedError.current = "limit";
          stop();
        }
      };
      instance.onerror = () => {
        forcedError.current = "failed";
        instance.onstop = null;
        chunks.current = [];
        if (instance.state !== "inactive") instance.stop();
        stopTimer();
        setError("failed");
        setStatus("idle");
        stopTracks();
        recorder.current = null;
      };
      instance.onstop = () => {
        stopTimer();
        const limitReached = forcedError.current === "limit";
        const blobMimeType = instance.mimeType || mimeType || "audio/webm";
        if (!limitReached) {
          const blob = new Blob(chunks.current, { type: blobMimeType });
          if (blob.size) {
            revokeObjectUrl();
            objectUrl.current = URL.createObjectURL(blob);
            setRecording({
              blob,
              durationMs: activeElapsed.current,
              mimeType: blob.type || blobMimeType,
              name: downloadName.current,
              url: objectUrl.current,
            });
          }
        }
        if (limitReached) setError("limit");
        setStatus("idle");
        stopTracks();
        chunks.current = [];
        recorder.current = null;
      };
      instance.start(1000);
    } catch (cause) {
      if (alive.current && token === request.current) {
        stopTracks();
        setError(permissionDenied(cause) ? "permission" : "failed");
      }
    } finally {
      if (alive.current && token === request.current) setPreparing(false);
    }
  }, [
    preparing,
    revokeObjectUrl,
    startTimer,
    status,
    stop,
    stopTimer,
    stopTracks,
    syncElapsed,
  ]);

  const pause = () => {
    if (recorder.current?.state === "recording") recorder.current.pause();
  };
  const resume = () => {
    if (recorder.current?.state === "paused") recorder.current.resume();
  };
  const clear = () => {
    revokeObjectUrl();
    setRecording(null);
    setError(null);
  };

  return {
    supported,
    status,
    preparing,
    error,
    elapsed,
    recording,
    start,
    pause,
    resume,
    stop,
    clear,
  };
}
