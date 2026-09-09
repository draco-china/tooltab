import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Chip,
  Link,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  Camera,
  CameraOff,
  Download,
  Flashlight,
  FlashlightOff,
  Mic,
  MicOff,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { MAX_IMAGE_PIXELS } from "@workspace/tools/image/options";

type CameraDevice = Readonly<{
  id: string;
  label: string;
}>;
type CameraMode = "photo" | "video";
type Capture = Readonly<{
  url: string;
  filename: string;
  kind: CameraMode;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
}>;
type CameraTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};
type CameraConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  zoom?: number;
};
const VIDEO_MAX_BYTES = 512 * 1024 * 1024;
const VIDEO_MAX_DURATION_MS = 10 * 60 * 1000;
const VIDEO_MIME_TYPES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;
function supportedVideoMimeType() {
  return (
    VIDEO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? ""
  );
}
function videoExtension(mimeType: string) {
  return mimeType.toLowerCase().includes("webm") ? "webm" : "mp4";
}
function formatDuration(ms = 0) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function cameraError(error: unknown) {
  if (!(error instanceof DOMException))
    return m["tools.camera.cameraErrorDescription"]();
  if (error.name === "NotAllowedError" || error.name === "SecurityError")
    return m["tools.camera.cameraPermissionDeniedDescription"]();
  if (error.name === "NotFoundError" || error.name === "OverconstrainedError")
    return m["tools.camera.errorNoDevice"]();
  if (error.name === "NotReadableError" || error.name === "AbortError")
    return m["tools.camera.errorBusy"]();
  return m["tools.camera.cameraErrorDescription"]();
}
function CameraToolContent() {
  const video = useRef<HTMLVideoElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const revision = useRef(0);
  const photoRevision = useRef(0);
  const mounted = useRef(true);
  const captureUrl = useRef("");
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const recordingBytes = useRef(0);
  const recordingStartedAt = useRef(0);
  const recordingTimer = useRef<number | null>(null);
  const recordingFailure = useRef<"failed" | "limit" | null>(null);
  const [status, setStatus] = useState<"idle" | "requesting" | "streaming">(
    "idle",
  );
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [mode, setMode] = useState<CameraMode>("photo");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [recorderSupport, setRecorderSupport] = useState<
    "checking" | "supported" | "unsupported"
  >("checking");
  const [zoom, setZoom] = useState({
    supported: false,
    min: 1,
    max: 1,
    step: 0.1,
    value: 1,
  });
  const stopRecordingTimer = useCallback(() => {
    if (recordingTimer.current !== null)
      window.clearInterval(recordingTimer.current);
    recordingTimer.current = null;
  }, []);
  const cancelRecorder = useCallback(() => {
    stopRecordingTimer();
    const current = recorder.current;
    if (current) {
      current.onstart = null;
      current.ondataavailable = null;
      current.onstop = null;
      current.onerror = null;
      if (current.state !== "inactive") current.stop();
    }
    recorder.current = null;
    recordingChunks.current = [];
    recordingBytes.current = 0;
    if (mounted.current) {
      setRecording(false);
      setElapsedMs(0);
    }
  }, [stopRecordingTimer]);
  const release = useCallback(() => {
    revision.current += 1;
    cancelRecorder();
    const current = stream.current;
    stream.current = null;
    current?.getTracks().forEach((track) => {
      track.stop();
    });
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    if (mounted.current) {
      setStatus("idle");
      setTorchSupported(false);
      setTorchEnabled(false);
      setZoom({ supported: false, min: 1, max: 1, step: 0.1, value: 1 });
    }
  }, [cancelRecorder]);
  const replaceCapture = useCallback((next: Capture | null) => {
    if (captureUrl.current) URL.revokeObjectURL(captureUrl.current);
    captureUrl.current = next?.url ?? "";
    setCapture(next);
  }, []);
  const refreshDevices = useCallback(
    async (preferred = "") => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const available = (await navigator.mediaDevices.enumerateDevices())
          .filter((item) => item.kind === "videoinput")
          .map((item, index) => ({
            id: item.deviceId,
            label: item.label || `${m["shared.barcode.camera"]()} ${index + 1}`,
          }));
        if (!mounted.current) return;
        setDevices(available);
        if (preferred && available.some((item) => item.id === preferred))
          setDeviceId(preferred);
        else if (
          available.length &&
          !available.some((item) => item.id === deviceId)
        )
          setDeviceId(available[0]?.id ?? "");
      } catch {
        // Device enumeration is optional; an active stream still remains usable.
      }
    },
    [deviceId],
  );
  const start = useCallback(
    async (requestedDeviceId = "", requestedMode: CameraMode = mode) => {
      release();
      const epoch = revision.current;
      setError("");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(m["tools.camera.cameraNotSupportedDescription"]());
        return;
      }
      setStatus("requesting");
      try {
        const videoConstraints = requestedDeviceId
          ? { deviceId: { exact: requestedDeviceId } }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };
        let acquired: MediaStream;
        try {
          acquired = await navigator.mediaDevices.getUserMedia({
            audio:
              requestedMode === "video"
                ? { echoCancellation: true, noiseSuppression: true }
                : false,
            video: videoConstraints,
          });
        } catch (reason) {
          if (!mounted.current || revision.current !== epoch) return;
          if (requestedMode !== "video") throw reason;
          acquired = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints,
          });
          if (mounted.current && revision.current === epoch)
            setMicEnabled(false);
        }
        if (!mounted.current || revision.current !== epoch) {
          acquired.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        const track = acquired.getVideoTracks()[0];
        if (!track) {
          acquired.getTracks().forEach((item) => {
            item.stop();
          });
          throw new DOMException("No video track", "NotFoundError");
        }
        stream.current = acquired;
        const audioTrack = acquired.getAudioTracks?.()[0];
        if (audioTrack) audioTrack.enabled = micEnabled;
        const capabilities = (track.getCapabilities?.() ??
          {}) as CameraTrackCapabilities;
        const settings = track.getSettings() as MediaTrackSettings & {
          zoom?: number;
        };
        setTorchSupported(Boolean(capabilities.torch));
        setTorchEnabled(false);
        setZoom(
          capabilities.zoom
            ? {
                supported: true,
                min: capabilities.zoom.min,
                max: capabilities.zoom.max,
                step: capabilities.zoom.step || 0.1,
                value: settings.zoom ?? capabilities.zoom.min,
              }
            : { supported: false, min: 1, max: 1, step: 0.1, value: 1 },
        );
        track.addEventListener(
          "ended",
          () => {
            if (stream.current !== acquired) return;
            release();
            if (mounted.current) setError(m["tools.camera.errorLost"]());
          },
          { once: true },
        );
        const element = video.current;
        if (!element) {
          release();
          return;
        }
        element.srcObject = acquired;
        await element.play();
        if (!mounted.current || revision.current !== epoch) {
          acquired.getTracks().forEach((item) => {
            item.stop();
          });
          return;
        }
        const selected = track.getSettings().deviceId ?? requestedDeviceId;
        setDeviceId(selected);
        setStatus("streaming");
        await refreshDevices(selected);
      } catch (reason) {
        if (!mounted.current || revision.current !== epoch) return;
        release();
        setError(cameraError(reason));
      }
    },
    [micEnabled, mode, refreshDevices, release],
  );
  function takePhoto() {
    const element = video.current;
    if (
      status !== "streaming" ||
      !element?.videoWidth ||
      !element.videoHeight
    ) {
      setError(m["tools.camera.cameraNotReady"]());
      return;
    }
    const canvas = document.createElement("canvas");
    const width = element.videoWidth;
    const height = element.videoHeight;
    if (
      !Number.isSafeInteger(width * height) ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      setError(m["tools.camera.errorTooLarge"]());
      return;
    }
    const epoch = ++photoRevision.current;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      canvas.width = canvas.height = 0;
      setError(m["tools.camera.cameraErrorDescription"]());
      return;
    }
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        canvas.width = canvas.height = 0;
        if (!mounted.current || photoRevision.current !== epoch) return;
        if (!blob) {
          setError(m["tools.camera.errorCapture"]());
          return;
        }
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        replaceCapture({
          url,
          filename: `${m["tools.camera.photoName"]()}-${stamp}.jpg`,
          kind: "photo",
          mimeType: blob.type || "image/jpeg",
          bytes: blob.size,
          width,
          height,
        });
        setError("");
      },
      "image/jpeg",
      0.92,
    );
  }
  const stopRecording = useCallback(() => {
    const current = recorder.current;
    if (current?.state !== "inactive") current?.stop();
  }, []);
  const startRecording = useCallback(() => {
    const activeStream = stream.current;
    if (
      mode !== "video" ||
      status !== "streaming" ||
      recording ||
      typeof MediaRecorder !== "function" ||
      !activeStream
    )
      return;
    const mimeType = supportedVideoMimeType();
    let instance: MediaRecorder;
    try {
      instance = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream);
    } catch {
      try {
        instance = new MediaRecorder(activeStream);
      } catch {
        setError(m["tools.camera.recordingFailed"]());
        return;
      }
    }
    recordingChunks.current = [];
    recordingBytes.current = 0;
    recordingFailure.current = null;
    recorder.current = instance;
    replaceCapture(null);
    instance.onstart = () => {
      if (!mounted.current || recorder.current !== instance) return;
      recordingStartedAt.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      setError("");
      stopRecordingTimer();
      recordingTimer.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartedAt.current;
        setElapsedMs(elapsed);
        if (elapsed >= VIDEO_MAX_DURATION_MS) {
          recordingFailure.current = "limit";
          stopRecording();
        }
      }, 200);
    };
    instance.ondataavailable = (event) => {
      if (!mounted.current || recorder.current !== instance || !event.data.size)
        return;
      recordingChunks.current.push(event.data);
      recordingBytes.current += event.data.size;
      if (recordingBytes.current > VIDEO_MAX_BYTES) {
        recordingFailure.current = "limit";
        stopRecording();
      }
    };
    instance.onerror = () => {
      if (!mounted.current || recorder.current !== instance) return;
      recordingFailure.current = "failed";
      if (instance.state !== "inactive") instance.stop();
    };
    instance.onstop = () => {
      if (!mounted.current || recorder.current !== instance) return;
      stopRecordingTimer();
      recorder.current = null;
      setRecording(false);
      const failure = recordingFailure.current;
      const durationMs = Math.max(0, Date.now() - recordingStartedAt.current);
      setElapsedMs(durationMs);
      const chunks = recordingChunks.current;
      recordingChunks.current = [];
      if (failure) {
        setError(
          failure === "limit"
            ? m["tools.camera.errorRecordingLimit"]()
            : m["tools.camera.recordingFailed"](),
        );
        return;
      }
      const outputType = instance.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks, { type: outputType });
      if (!blob.size) {
        setError(m["tools.camera.recordingFailed"]());
        return;
      }
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      replaceCapture({
        url,
        filename: `${m["tools.camera.videoName"]()}-${stamp}.${videoExtension(outputType)}`,
        kind: "video",
        mimeType: blob.type || outputType,
        bytes: blob.size,
        durationMs,
      });
      setError("");
    };
    try {
      instance.start(1000);
    } catch {
      cancelRecorder();
      setError(m["tools.camera.recordingFailed"]());
    }
  }, [
    cancelRecorder,
    mode,
    recording,
    replaceCapture,
    status,
    stopRecording,
    stopRecordingTimer,
  ]);
  const toggleTorch = useCallback(async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const epoch = revision.current;
    const next = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as CameraConstraintSet],
      });
      if (!mounted.current || revision.current !== epoch) return;
      setTorchEnabled(next);
    } catch {
      if (!mounted.current || revision.current !== epoch) return;
      setError(m["tools.camera.errorControl"]());
    }
  }, [torchEnabled, torchSupported]);
  const changeZoom = useCallback(
    async (value: number) => {
      const track = stream.current?.getVideoTracks()[0];
      if (!track || !zoom.supported) return;
      const epoch = revision.current;
      const previous = zoom.value;
      setZoom((current) => ({ ...current, value }));
      try {
        await track.applyConstraints({
          advanced: [{ zoom: value } as CameraConstraintSet],
        });
      } catch {
        if (!mounted.current || revision.current !== epoch) return;
        setZoom((current) => ({ ...current, value: previous }));
        setError(m["tools.camera.errorControl"]());
      }
    },
    [zoom.supported, zoom.value],
  );
  useEffect(() => {
    mounted.current = true;
    setRecorderSupport(
      typeof MediaRecorder === "function" ? "supported" : "unsupported",
    );
    return () => {
      mounted.current = false;
      photoRevision.current += 1;
      release();
      if (captureUrl.current) URL.revokeObjectURL(captureUrl.current);
    };
  }, [release]);
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const changed = () => {
      void refreshDevices();
      if (
        status === "streaming" &&
        stream.current?.getVideoTracks()[0]?.readyState === "ended"
      ) {
        release();
        setError(m["tools.camera.errorLost"]());
      }
    };
    media.addEventListener("devicechange", changed);
    return () => media.removeEventListener("devicechange", changed);
  }, [refreshDevices, release, status]);

  const recorderSupported = recorderSupport === "supported";
  const permissionDenied =
    error === m["tools.camera.cameraPermissionDeniedDescription"]();
  const cameraUnsupported =
    error === m["tools.camera.cameraNotSupportedDescription"]();
  const activeError =
    error && !permissionDenied && !cameraUnsupported ? error : "";
  const shutterLabel =
    mode === "photo"
      ? m["tools.camera.capturePhotoLabel"]()
      : recording
        ? m["tools.camera.stopRecordingLabel"]()
        : m["tools.camera.startRecordingLabel"]();

  function switchCamera() {
    if (status === "requesting" || recording || devices.length < 2) return;
    const currentIndex = devices.findIndex((item) => item.id === deviceId);
    const next = devices[(currentIndex + 1) % devices.length];
    if (!next) return;
    setDeviceId(next.id);
    void start(next.id, mode);
  }

  function openOutput() {
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    outputRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    outputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["shared.barcode.camera"]()}</Card.Title>
          <Card.Description>
            {m["tools.camera.viewfinderDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="p-0">
          <div className="relative aspect-3/4 w-full overflow-hidden bg-black sm:aspect-video">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label={m["shared.barcode.camera"]()}
              className="h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-linear-to-b from-black/70 to-transparent p-3">
              <div className="pointer-events-auto flex items-center gap-2">
                {torchSupported ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="secondary"
                    aria-label={
                      torchEnabled
                        ? m["tools.camera.torchOffLabel"]()
                        : m["tools.camera.torchOnLabel"]()
                    }
                    isDisabled={recording}
                    onPress={() => void toggleTorch()}
                  >
                    {torchEnabled ? (
                      <FlashlightOff aria-hidden />
                    ) : (
                      <Flashlight aria-hidden />
                    )}
                  </Button>
                ) : null}
                {mode === "video" ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="secondary"
                    aria-label={
                      micEnabled
                        ? m["tools.camera.micOnLabel"]()
                        : m["tools.camera.micOffLabel"]()
                    }
                    isDisabled={
                      status !== "streaming" ||
                      recording ||
                      !stream.current?.getAudioTracks?.().length
                    }
                    onPress={() => {
                      setMicEnabled((current) => {
                        const next = !current;
                        const track = stream.current?.getAudioTracks?.()[0];
                        if (track) track.enabled = next;
                        return next;
                      });
                    }}
                  >
                    {micEnabled ? <Mic aria-hidden /> : <MicOff aria-hidden />}
                  </Button>
                ) : null}
              </div>

              {recording ? (
                <Chip
                  color="danger"
                  role="status"
                  className="pointer-events-auto gap-2"
                >
                  <span className="size-2 rounded-full bg-current" />
                  {m["tools.camera.recordingStatusLabel"]()}{" "}
                  {formatDuration(elapsedMs)}
                </Chip>
              ) : status === "streaming" ? (
                <Chip variant="secondary" className="pointer-events-auto">
                  {m["tools.camera.cameraActiveLabel"]()}
                </Chip>
              ) : null}

              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                aria-label={m["tools.camera.switchCameraLabel"]()}
                isDisabled={
                  status !== "streaming" || recording || devices.length < 2
                }
                className="pointer-events-auto"
                onPress={switchCamera}
              >
                <RefreshCw aria-hidden />
              </Button>
            </div>

            {status !== "streaming" || error ? (
              <div
                role={error ? "alert" : undefined}
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center text-white"
              >
                <div
                  className="flex flex-col items-center gap-2"
                  aria-live="polite"
                >
                  <Camera aria-hidden className="size-8" />
                  <p className="text-lg font-semibold">
                    {cameraUnsupported
                      ? m["tools.camera.cameraNotSupportedTitle"]()
                      : permissionDenied
                        ? m["shared.barcodeTools.readerCameraPermissionTitle"]()
                        : activeError
                          ? m[
                              "shared.barcodeTools.readerCameraUnsupportedTitle"
                            ]()
                          : status === "requesting"
                            ? m["tools.camera.preparingCamera"]()
                            : m["tools.camera.cameraIdleTitle"]()}
                  </p>
                  <p className="max-w-sm text-sm text-white/75">
                    {cameraUnsupported
                      ? m["tools.camera.cameraNotSupportedDescription"]()
                      : permissionDenied
                        ? m["tools.camera.cameraPermissionDeniedDescription"]()
                        : activeError ||
                          m["tools.camera.cameraIdleDescription"]()}
                  </p>
                </div>
                {!cameraUnsupported && status !== "requesting" ? (
                  <Button onPress={() => void start(deviceId, mode)}>
                    <Camera data-slot="icon" aria-hidden />
                    {permissionDenied
                      ? m["tools.camera.retryPermissionLabel"]()
                      : m["shared.barcodeTools.readerStartCameraLabel"]()}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {zoom.supported ? (
              <div className="absolute inset-x-4 bottom-28 flex items-center gap-3 rounded-full bg-black/60 px-3 py-2 text-white">
                <span className="text-xs font-medium">
                  {m["tools.camera.zoomLabel"]()}
                </span>
                <Slider
                  value={zoom.value}
                  minValue={zoom.min}
                  maxValue={zoom.max}
                  step={zoom.step}
                  isDisabled={status === "requesting" || recording}
                  aria-label={m["tools.camera.zoomLabel"]()}
                  className="min-h-8 flex-1"
                  onChange={(value) => void changeZoom(Number(value))}
                >
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>
                <span className="min-w-10 text-right text-xs font-medium">
                  {zoom.value.toFixed(1)}×
                </span>
              </div>
            ) : null}

            {capture ? (
              <Button
                type="button"
                variant="ghost"
                isIconOnly
                aria-label={m["tools.camera.outputTitle"]()}
                className="absolute bottom-24 left-4 size-16 overflow-hidden rounded-xl border-2 border-white/70 bg-black shadow-lg transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-white"
                onClick={openOutput}
              >
                {capture.kind === "photo" ? (
                  <img
                    src={capture.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={capture.url}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  >
                    <track kind="captions" />
                  </video>
                )}
              </Button>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-linear-to-t from-black/80 to-transparent p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <ToggleButtonGroup
                selectionMode="single"
                selectedKeys={new Set([mode])}
                isDisabled={status === "requesting" || recording}
                aria-label={m["shared.barcode.camera"]()}
                className="justify-self-start bg-background/95"
                onSelectionChange={(selection) => {
                  const next = String([...selection][0] ?? "") as CameraMode;
                  if (!next || next === mode) return;
                  if (next === "video" && recorderSupport === "unsupported") {
                    setError(m["tools.camera.videoNotSupported"]());
                    return;
                  }
                  setMode(next);
                  setError("");
                  if (status === "streaming") void start(deviceId, next);
                }}
              >
                <ToggleButton id="photo" size="sm">
                  <Camera data-slot="icon" aria-hidden />
                  {m["tools.camera.photoMode"]()}
                </ToggleButton>
                <ToggleButton
                  id="video"
                  size="sm"
                  isDisabled={!recorderSupported}
                >
                  <Video data-slot="icon" aria-hidden />
                  {m["tools.camera.videoMode"]()}
                </ToggleButton>
              </ToggleButtonGroup>

              <Button
                isIconOnly
                variant="ghost"
                aria-label={shutterLabel}
                isDisabled={status !== "streaming" || permissionDenied}
                className="size-20 min-w-20 rounded-full border-4 border-white/90 bg-transparent p-0 shadow-xl"
                onPress={
                  mode === "photo"
                    ? takePhoto
                    : recording
                      ? stopRecording
                      : startRecording
                }
              >
                <span
                  aria-hidden
                  className={
                    recording
                      ? "size-10 rounded-xl bg-danger transition-all duration-200"
                      : "size-14 rounded-full bg-white transition-all duration-200"
                  }
                />
              </Button>

              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                aria-label={m["shared.barcodeTools.readerStopCameraLabel"]()}
                isDisabled={status !== "streaming" || recording}
                className="justify-self-end"
                onPress={release}
              >
                <CameraOff aria-hidden />
              </Button>
            </div>
          </div>
        </ToolPanelCardContent>
        {recorderSupport === "unsupported" ? (
          <ToolPanelCardFooter className="text-sm text-muted">
            {m["tools.camera.videoNotSupported"]()}
          </ToolPanelCardFooter>
        ) : null}
      </ToolPanelCard>

      <div
        ref={outputRef}
        tabIndex={-1}
        className="scroll-mt-24 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.camera.outputTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.camera.outputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {capture ? (
              <>
                <div className="overflow-hidden rounded-xl border border-border bg-default/30">
                  {capture.kind === "photo" ? (
                    <img
                      src={capture.url}
                      alt={m["tools.camera.photoMode"]()}
                      className="max-h-96 w-full object-contain"
                    />
                  ) : (
                    <video
                      src={capture.url}
                      controls
                      aria-label={m["tools.camera.videoMode"]()}
                      className="max-h-96 w-full bg-black object-contain"
                    >
                      <track kind="captions" />
                    </video>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip variant="secondary">
                    {capture.kind === "photo"
                      ? m["tools.camera.photoMode"]()
                      : m["tools.camera.videoMode"]()}
                  </Chip>
                  <Chip variant="secondary" className="border border-border">
                    {m["common.archiveformat"]()}:{" "}
                    {capture.mimeType ||
                      m["tools.userAgentParser.devUnknown"]()}
                  </Chip>
                  <Chip variant="secondary" className="border border-border">
                    {m["tools.audioRecorder.size"]()}:{" "}
                    {formatBytes(capture.bytes)}
                  </Chip>
                  {capture.kind === "photo" ? (
                    <Chip variant="secondary" className="border border-border">
                      {capture.width} × {capture.height}
                    </Chip>
                  ) : (
                    <Chip variant="secondary" className="border border-border">
                      {formatDuration(capture.durationMs)}
                    </Chip>
                  )}
                </div>
              </>
            ) : (
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <div className="grid max-w-sm justify-items-center gap-2">
                  <Camera aria-hidden className="size-8 text-muted" />
                  <h3 className="font-semibold">
                    {m["tools.camera.emptyOutputTitle"]()}
                  </h3>
                  <p className="text-sm text-muted">
                    {m["tools.camera.emptyOutputDescription"]()}
                  </p>
                </div>
              </div>
            )}
          </ToolPanelCardContent>
          {capture ? (
            <ToolPanelCardFooter className="justify-end gap-2">
              <Button
                variant="outline"
                onPress={() => {
                  photoRevision.current += 1;
                  replaceCapture(null);
                }}
              >
                <Trash2 data-slot="icon" aria-hidden />
                {m["common.clear"]()}
              </Button>
              <Link
                href={capture.url}
                download={capture.filename}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-foreground transition-opacity duration-200 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Download aria-hidden className="size-4" />
                {m["tools.camera.downloadLabel"]()}
              </Link>
            </ToolPanelCardFooter>
          ) : null}
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.camera.articleWhatTitle"]()}</h2>
        <p>{m["tools.camera.articleWhatBody"]()}</p>
        <h2>{m["tools.camera.article.casesTitle"]()}</h2>
        <ul>
          <li>{m["tools.camera.articleCaseOne"]()}</li>
          <li>{m["tools.camera.articleCaseTwo"]()}</li>
          <li>{m["tools.camera.articleCaseThree"]()}</li>
        </ul>
        <h2>{m["tools.camera.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.camera.articlePrivacyBody"]()}</p>
        <ul>
          <li>{m["tools.camera.articlePrivacyOne"]()}</li>
          <li>{m["tools.camera.articlePrivacyTwo"]()}</li>
          <li>{m["tools.camera.articlePrivacyThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function CameraTool() {
  return (
    <ToolPage>
      <CameraToolContent />
    </ToolPage>
  );
}
