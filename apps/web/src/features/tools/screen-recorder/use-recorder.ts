import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureCancelled,
  SCREEN_MAX_BYTES,
  SCREEN_MAX_DURATION_MS,
  screenName,
  supportedScreenMime,
} from "./logic";

type Status = "idle" | "recording" | "paused";
type SupportStatus = "checking" | "supported" | "unsupported";
type Failure =
  | "screenPermission"
  | "microphonePermission"
  | "microphoneUnsupported"
  | "failed"
  | "limit";
type Output = {
  blob: Blob;
  url: string;
  mimeType: string;
  name: string;
  durationMs: number;
};
type Mixer = {
  context: AudioContext | null;
  sources: MediaStreamAudioSourceNode[];
};

export function screenRecordingSupported() {
  return Boolean(
    typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
      typeof MediaRecorder === "function",
  );
}
const stopStream = (value: MediaStream | null) =>
  value?.getTracks().forEach((track) => {
    track.stop();
  });

function recordingStream(display: MediaStream, microphone: MediaStream | null) {
  const result = new MediaStream();
  for (const track of display.getVideoTracks()) result.addTrack(track);
  const audio = [display, microphone]
    .filter((item): item is MediaStream => Boolean(item))
    .flatMap((item) => item.getAudioTracks());
  const mixer: Mixer = { context: null, sources: [] };
  if (audio.length === 1 || typeof AudioContext !== "function") {
    if (audio[0]) result.addTrack(audio[0]);
  } else if (audio.length > 1) {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    mixer.context = context;
    for (const track of audio) {
      const source = context.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
      mixer.sources.push(source);
    }
    const mixed = destination.stream.getAudioTracks()[0];
    if (mixed) result.addTrack(mixed);
  }
  return { stream: result, mixer };
}

export function useScreenRecorder() {
  const [supportStatus, setSupportStatus] = useState<SupportStatus>("checking");
  const [microphoneSupported, setMicrophoneSupported] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [preparing, setPreparing] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [includeMicrophone, setIncludeMicrophone] = useState(false);
  const [output, setOutput] = useState<Output | null>(null);
  const display = useRef<MediaStream | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mixer = useRef<Mixer | null>(null);
  const chunks = useRef<Blob[]>([]);
  const totalBytes = useRef(0);
  const accumulated = useRef(0);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const forced = useRef<Failure | null>(null);
  const url = useRef("");
  const downloadName = useRef("screen-recording.webm");
  const alive = useRef(true);
  const request = useRef(0);
  const starting = useRef(false);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);
  const syncElapsed = useCallback(() => {
    if (started.current)
      accumulated.current += Math.max(0, Date.now() - started.current);
    started.current = 0;
    setElapsed(accumulated.current);
  }, []);
  const cleanup = useCallback(() => {
    stopStream(display.current);
    stopStream(microphone.current);
    display.current = microphone.current = null;
    for (const source of mixer.current?.sources ?? []) source.disconnect();
    void mixer.current?.context?.close();
    mixer.current = null;
  }, []);
  const revoke = useCallback(() => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = "";
  }, []);
  const stop = useCallback(() => {
    const active = recorder.current;
    if (!active || active.state === "inactive") return;
    if (active.state === "recording") syncElapsed();
    stopTimer();
    active.stop();
  }, [stopTimer, syncElapsed]);
  const startTimer = useCallback(() => {
    stopTimer();
    started.current = Date.now();
    timer.current = window.setInterval(() => {
      const value = accumulated.current + Date.now() - started.current;
      setElapsed(value);
      if (value >= SCREEN_MAX_DURATION_MS) {
        forced.current = "limit";
        stop();
      }
    }, 200);
  }, [stop, stopTimer]);

  useEffect(() => {
    alive.current = true;
    setSupportStatus(screenRecordingSupported() ? "supported" : "unsupported");
    setMicrophoneSupported(
      typeof navigator.mediaDevices?.getUserMedia === "function",
    );
    return () => {
      alive.current = false;
      // Invalidate the latest async generation at cleanup, not the generation captured at mount.
      request.current++;
      starting.current = false;
      stopTimer();
      if (recorder.current) {
        recorder.current.onstart = null;
        recorder.current.onpause = null;
        recorder.current.onresume = null;
        recorder.current.ondataavailable = null;
        recorder.current.onstop = null;
        recorder.current.onerror = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
      }
      cleanup();
      revoke();
    };
  }, [cleanup, revoke, stopTimer]);

  const start = useCallback(async () => {
    if (starting.current || preparing || status !== "idle") return;
    if (!screenRecordingSupported()) {
      setSupportStatus("unsupported");
      return;
    }
    const token = ++request.current;
    starting.current = true;
    setPreparing(true);
    setFailure(null);
    forced.current = null;
    chunks.current = [];
    totalBytes.current = 0;
    accumulated.current = 0;
    setElapsed(0);
    if (includeMicrophone && !microphoneSupported) {
      setFailure("microphoneUnsupported");
      setPreparing(false);
      starting.current = false;
      return;
    }
    let captured: MediaStream | null = null;
    let capturedMicrophone: MediaStream | null = null;
    const stopCaptured = () => {
      stopStream(captured);
      stopStream(capturedMicrophone);
    };
    try {
      captured = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: includeSystemAudio,
      });
      if (!alive.current || token !== request.current) {
        stopStream(captured);
        return;
      }
      display.current = captured;
      const video = captured.getVideoTracks()[0];
      if (!video) throw new Error("missing video track");
      video.addEventListener("ended", stop, { once: true });
      if (includeMicrophone) {
        try {
          capturedMicrophone = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        } catch {
          if (alive.current && token === request.current) {
            starting.current = false;
            cleanup();
            setFailure("microphonePermission");
          } else stopCaptured();
          return;
        }
        if (!alive.current || token !== request.current) {
          stopCaptured();
          return;
        }
        microphone.current = capturedMicrophone;
      }
      if (video.readyState === "ended") throw new Error("capture ended");
      const combined = recordingStream(captured, microphone.current);
      mixer.current = combined.mixer;
      const mime = supportedScreenMime(
        MediaRecorder.isTypeSupported?.bind(MediaRecorder),
      );
      let instance: MediaRecorder;
      try {
        instance = mime
          ? new MediaRecorder(combined.stream, { mimeType: mime })
          : new MediaRecorder(combined.stream);
      } catch {
        instance = new MediaRecorder(combined.stream);
      }
      recorder.current = instance;
      downloadName.current = screenName(new Date(), instance.mimeType || mime);
      instance.onstart = () => {
        starting.current = false;
        revoke();
        setOutput(null);
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
        totalBytes.current += event.data.size;
        if (totalBytes.current > SCREEN_MAX_BYTES) {
          forced.current = "limit";
          stop();
        }
      };
      instance.onerror = () => {
        forced.current = "failed";
        instance.onstop = null;
        chunks.current = [];
        if (instance.state !== "inactive") instance.stop();
        stopTimer();
        setFailure("failed");
        setStatus("idle");
        starting.current = false;
        cleanup();
        recorder.current = null;
      };
      instance.onstop = () => {
        stopTimer();
        const limited = forced.current === "limit";
        const mimeType = instance.mimeType || mime || "video/webm";
        if (!limited) {
          const blob = new Blob(chunks.current, { type: mimeType });
          if (blob.size) {
            revoke();
            url.current = URL.createObjectURL(blob);
            setOutput({
              blob,
              url: url.current,
              mimeType: blob.type || mimeType,
              name: downloadName.current,
              durationMs: accumulated.current,
            });
          } else setFailure("failed");
        } else setFailure("limit");
        chunks.current = [];
        setStatus("idle");
        starting.current = false;
        cleanup();
        recorder.current = null;
      };
      instance.start(1000);
    } catch (error) {
      if (alive.current && token === request.current) {
        starting.current = false;
        cleanup();
        setFailure(captureCancelled(error) ? "screenPermission" : "failed");
      } else stopCaptured();
    } finally {
      if (alive.current && token === request.current) {
        setPreparing(false);
      }
    }
  }, [
    cleanup,
    includeMicrophone,
    includeSystemAudio,
    microphoneSupported,
    preparing,
    revoke,
    startTimer,
    status,
    stop,
    stopTimer,
    syncElapsed,
  ]);

  const pause = () => {
    if (recorder.current?.state === "recording") recorder.current.pause();
  };
  const resume = () => {
    if (recorder.current?.state === "paused") recorder.current.resume();
  };
  const clear = () => {
    revoke();
    setOutput(null);
    setFailure(null);
  };
  return {
    supported: supportStatus === "supported",
    supportStatus,
    microphoneSupported,
    status,
    preparing,
    failure,
    elapsed,
    output,
    includeSystemAudio,
    includeMicrophone,
    setIncludeSystemAudio,
    setIncludeMicrophone,
    start,
    pause,
    resume,
    stop,
    clear,
  };
}
