import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Link,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  ArrowRight,
  Camera,
  CameraOff,
  FileText,
  Image as ImageIcon,
  Play,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import {
  type CodeReaderCameraStatus,
  useCodeReaderResources,
} from "@/features/tools/_shared/code-reader/use-code-reader-resources";
import { useObjectUrl } from "@/hooks/use-object-url";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { readQrFile } from "../qr-tools/browser";
import {
  QR_PIXEL_LIMIT,
  type QrReadResult,
} from "@workspace/tools/encoding/qr-contract";
import { runQrWorker } from "../qr-tools/worker-client";

type ReaderResult = NonNullable<QrReadResult> & {
  source: "image" | "camera";
};

function PanelHeader(props: { title: string; description: string }) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{props.title}</Card.Title>
      <Card.Description>{props.description}</Card.Description>
    </Card.Header>
  );
}

function formatFileSize(bytes: number, locale: string) {
  const size =
    bytes < 1024
      ? { unit: "byte" as const, value: bytes }
      : bytes < 1024 * 1024
        ? { unit: "kilobyte" as const, value: bytes / 1024 }
        : { unit: "megabyte" as const, value: bytes / (1024 * 1024) };
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: size.unit === "byte" ? 0 : 1,
    minimumFractionDigits: size.unit === "byte" ? 0 : 1,
    style: "unit",
    unit: size.unit,
    unitDisplay: "short",
  }).format(size.value);
}

function readerErrorMessage(error: unknown) {
  const code =
    error instanceof Error && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : String(error);
  if (code === "too_large") return m["shared.qrTools.toolarge"]();
  if (code === "timeout") return m["shared.qrTools.timeout"]();
  if (code === "busy") return m["shared.qrTools.busy"]();
  if (code === "invalid_input")
    return m["shared.barcodeTools.readerInvalidFileTypeError"]();
  if (code === "unsupported")
    return m["tools.qrCodeReader.canvasUnavailableError"]();
  if (code === "decode_failed") return m["tools.qrCodeReader.imageLoadError"]();
  return m["tools.qrCodeReader.canvasReadError"]();
}

function CameraNotice({
  status,
  errorMessage,
}: {
  status: CodeReaderCameraStatus;
  errorMessage: string;
}) {
  const details =
    status === "unsupported"
      ? [
          m["shared.barcodeTools.readerCameraUnsupportedTitle"](),
          m["tools.qrCodeReader.cameraUnsupportedDescription"](),
        ]
      : status === "permission-denied"
        ? [
            m["shared.barcodeTools.readerCameraPermissionTitle"](),
            m["tools.qrCodeReader.cameraPermissionDescription"](),
          ]
        : status === "error"
          ? [
              m["shared.barcodeTools.readerCameraErrorTitle"](),
              errorMessage ||
                m["shared.barcodeTools.readerCameraErrorDescription"](),
            ]
          : status === "scanning"
            ? [
                m["shared.barcodeTools.readerCameraScanningTitle"](),
                m["tools.qrCodeReader.cameraScanningDescription"](),
              ]
            : null;
  if (!details) return null;
  const danger = status === "permission-denied" || status === "error";
  const Icon =
    status === "unsupported" ? CameraOff : danger ? TriangleAlert : Camera;
  return (
    <Alert
      status={danger ? "danger" : "default"}
      role={danger ? "alert" : undefined}
    >
      <Alert.Indicator>
        <Icon aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{details[0]}</Alert.Title>
        <Alert.Description>{details[1]}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function QrReaderContent() {
  const locale = getLocale();
  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReaderResult | null>(null);
  const [error, setError] = useState("");
  const [decoding, setDecoding] = useState(false);
  const previewUrl = useObjectUrl(selectedFile);
  const readCameraPixels = useCallback(
    (
      data: Uint8ClampedArray<ArrayBuffer>,
      width: number,
      height: number,
      signal: AbortSignal,
    ) => runQrWorker({ kind: "read", data, width, height }, signal),
    [],
  );
  const handleCameraResult = useCallback(
    (decoded: NonNullable<QrReadResult>) => {
      setResult({ ...decoded, source: "camera" });
      setError("");
    },
    [],
  );
  const {
    abortTask,
    cameraError,
    cameraStatus,
    finishTask,
    isCurrentTask,
    startCamera,
    startTask,
    stopCamera,
    video,
  } = useCodeReaderResources({
    pixelLimit: QR_PIXEL_LIMIT,
    readPixels: readCameraPixels,
    onCameraStart: () => setError(""),
    onCameraResult: handleCameraResult,
    frameError: m["shared.barcodeTools.readerCameraFrameError"](),
  });

  const scanFile = useCallback(
    async (file: File) => {
      const controller = startTask();
      setSelectedFile(file);
      setResult(null);
      setError("");
      setDecoding(true);
      if (!file.type.startsWith("image/")) {
        setSelectedFile(null);
        setError(m["shared.barcodeTools.readerInvalidFileTypeError"]());
        setDecoding(false);
        finishTask(controller);
        return;
      }
      try {
        const decoded = await readQrFile(file, controller.signal);
        if (!isCurrentTask(controller)) return;
        if (decoded) setResult({ ...decoded, source: "image" });
        else setError(m["tools.qrCodeReader.noQrFoundError"]());
      } catch (cause) {
        if (isCurrentTask(controller) && !controller.signal.aborted) {
          setError(readerErrorMessage(cause));
        }
      } finally {
        if (isCurrentTask(controller)) {
          finishTask(controller);
          setDecoding(false);
        }
      }
    },
    [finishTask, isCurrentTask, startTask],
  );

  const clearImage = useCallback(() => {
    abortTask();
    setSelectedFile(null);
    setDecoding(false);
    setError("");
    setResult((current) => (current?.source === "image" ? null : current));
  }, [abortTask]);

  const contentTypeLabels: Record<string, string> = {
    calendar: m["shared.barcodeTools.readerContentTypeCalendar"](),
    email: m["shared.qrTools.email"](),
    location: m["shared.qrTools.location"](),
    phone: m["shared.qrTools.phone"](),
    sms: m["shared.barcodeTools.readerContentTypeSms"](),
    text: m["shared.aesTools.decrypttextplaintextlabel"](),
    url: m["shared.barcodeTools.readerContentTypeUrl"](),
    vcard: m["shared.barcodeTools.readerContentTypeVcard"](),
    wifi: m["shared.qrTools.wifi"](),
  };

  return (
    <div className="grid gap-8" data-tool="qr-code-reader">
      <div className="flex flex-col gap-6">
        <ToolPanelCard>
          <PanelHeader
            title={m["shared.barcodeTools.readerSourceTitle"]()}
            description={m["tools.qrCodeReader.sourceDescription"]()}
          />
          <ToolPanelCardContent className="py-4">
            <ToggleButtonGroup
              selectionMode="single"
              aria-label={m["shared.barcodeTools.readerSourceTitle"]()}
              className="w-full [&_button]:min-h-11 [&_button]:flex-1"
              selectedKeys={new Set([mode])}
              onSelectionChange={(selection) => {
                const next = String([...selection][0] ?? "");
                if (next !== "upload" && next !== "camera") return;
                if (next === "upload") stopCamera();
                else {
                  abortTask();
                  setDecoding(false);
                }
                setMode(next);
                setError("");
              }}
            >
              <ToggleButton id="upload">
                <ImageIcon aria-hidden className="size-4" />
                {m["shared.barcode.image"]()}
              </ToggleButton>
              <ToggleButton id="camera">
                <Camera aria-hidden className="size-4" />
                {m["shared.barcode.camera"]()}
              </ToggleButton>
            </ToggleButtonGroup>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
          {mode === "upload" ? (
            <ToolPanelCard>
              <PanelHeader
                title={m["shared.barcodeTools.readerUploadTitle"]()}
                description={m["tools.qrCodeReader.uploadDescription"]()}
              />
              <ToolPanelCardContent className="gap-4 py-4">
                <ToolFilePicker
                  label={
                    selectedFile
                      ? m["common.change"]()
                      : m["shared.barcodeTools.readerChooseImageLabel"]()
                  }
                  accept={["image/*"]}
                  fileName={selectedFile?.name}
                  clearLabel={m["common.faviconremoveimage"]()}
                  description={m["tools.qrCodeReader.supportedFormatsLabel"]()}
                  onSelect={(file) => void scanFile(file)}
                  onClear={clearImage}
                />

                {selectedFile && previewUrl ? (
                  <div className="grid gap-3">
                    <div className="overflow-hidden rounded-xl border border-border bg-default/30 p-3">
                      <img
                        alt=""
                        className="h-72 w-full rounded-lg object-contain"
                        decoding="async"
                        height={288}
                        src={previewUrl}
                        width={640}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip variant="soft">{m["common.imfile"]()}</Chip>
                      <Chip variant="secondary">
                        {formatFileSize(selectedFile.size, locale)}
                      </Chip>
                    </div>
                    {decoding ? (
                      <div
                        aria-busy="true"
                        aria-label={m[
                          "shared.barcodeTools.readerDecodingImageLabel"
                        ]()}
                        role="status"
                        className="grid gap-2 rounded-lg border border-border p-3"
                      >
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </ToolPanelCardContent>
            </ToolPanelCard>
          ) : (
            <ToolPanelCard>
              <PanelHeader
                title={m["shared.barcodeTools.readerCameraTitle"]()}
                description={m["tools.qrCodeReader.cameraDescription"]()}
              />
              <ToolPanelCardContent className="gap-4 py-4">
                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-default">
                  <video
                    ref={video}
                    aria-label={m["shared.barcodeTools.readerCameraTitle"]()}
                    autoPlay
                    muted
                    playsInline
                    className={`h-full w-full bg-black object-cover transition-opacity ${
                      cameraStatus === "scanning" ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {cameraStatus === "scanning" ? (
                    <div className="pointer-events-none absolute inset-4 rounded-xl border border-accent">
                      <div className="absolute inset-x-8 top-1/2 h-px bg-accent" />
                    </div>
                  ) : cameraStatus === "starting" ? (
                    <div
                      aria-busy="true"
                      aria-label={m[
                        "shared.barcodeTools.readerStartingCameraLabel"
                      ]()}
                      role="status"
                      className="absolute inset-0 grid content-center gap-3 p-8"
                    >
                      <Skeleton className="mx-auto size-12 rounded-full" />
                      <Skeleton className="mx-auto h-4 w-1/2" />
                      <Skeleton className="mx-auto h-4 w-3/4" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-background text-muted">
                        <Camera aria-hidden className="size-5" />
                      </span>
                      <p className="font-medium">
                        {m["tools.qrCodeReader.cameraIdleTitle"]()}
                      </p>
                      <p className="text-sm text-muted">
                        {m["tools.qrCodeReader.cameraIdleDescription"]()}
                      </p>
                    </div>
                  )}
                </div>
                <CameraNotice
                  status={cameraStatus}
                  errorMessage={cameraError}
                />
              </ToolPanelCardContent>
              <ToolPanelCardFooter className="justify-end gap-3">
                {cameraStatus === "scanning" ? (
                  <Button variant="outline" onPress={stopCamera}>
                    <Square aria-hidden className="size-4" />
                    {m["shared.barcodeTools.readerStopCameraLabel"]()}
                  </Button>
                ) : (
                  <Button
                    isDisabled={
                      cameraStatus === "starting" ||
                      cameraStatus === "unsupported"
                    }
                    onPress={() => void startCamera()}
                  >
                    <Play aria-hidden className="size-4" />
                    {cameraStatus === "starting"
                      ? m["shared.barcodeTools.readerStartingCameraLabel"]()
                      : m["shared.barcodeTools.readerStartCameraLabel"]()}
                  </Button>
                )}
              </ToolPanelCardFooter>
            </ToolPanelCard>
          )}

          <ToolPanelCard aria-live="polite">
            <PanelHeader
              title={m["shared.barcodeTools.readerResultTitle"]()}
              description={m["tools.qrCodeReader.resultDescription"]()}
            />
            <ToolPanelCardContent className="gap-4 py-4">
              {decoding ? (
                <div
                  aria-busy="true"
                  aria-label={m[
                    "shared.barcodeTools.readerDecodingImageLabel"
                  ]()}
                  role="status"
                  className="grid min-h-64 content-center gap-3 rounded-lg border border-border p-6"
                >
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              ) : result ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Chip variant="soft">
                      {m["common.uaFieldType"]()}:{" "}
                      {contentTypeLabels[result.kind] ??
                        m["shared.aesTools.decrypttextplaintextlabel"]()}
                    </Chip>
                    <Chip variant="secondary">
                      {result.source === "camera"
                        ? m["shared.barcode.camera"]()
                        : m["shared.barcode.image"]()}
                    </Chip>
                    <Chip variant="secondary" className="font-mono">
                      {m["tools.qrCodeReader.dimensionsLabel"]()}:{" "}
                      {result.width} × {result.height}
                    </Chip>
                  </div>
                  <CodeBlock
                    code={result.data}
                    title={m["shared.barcodeTools.readerDecodedContentLabel"]()}
                    copyLabel={m["common.actions.copyResult"]()}
                    copiedLabel={m["common.actions.copied"]()}
                    maxHeightClassName="max-h-80"
                    wrap
                  />
                </>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted">
                    <FileText aria-hidden className="size-5" />
                  </span>
                  <p className="font-medium">
                    {m["tools.qrCodeReader.emptyResultTitle"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {m["shared.barcodeTools.readerEmptyResultDescription"]()}
                  </p>
                </div>
              )}
            </ToolPanelCardContent>
            {result && !decoding ? (
              <ToolPanelCardFooter className="flex-wrap justify-end gap-3">
                {result.href ? (
                  <Link
                    href={result.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"
                  >
                    <ArrowRight aria-hidden className="size-4" />
                    {m["shared.barcodeTools.readerOpenResultLabel"]()}
                  </Link>
                ) : (
                  <Button isDisabled size="sm" variant="outline">
                    <ArrowRight aria-hidden className="size-4" />
                    {m["shared.barcodeTools.readerOpenResultLabel"]()}
                  </Button>
                )}
              </ToolPanelCardFooter>
            ) : null}
          </ToolPanelCard>
        </div>

        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["shared.barcodeTools.readerErrorTitle"]()}
              </Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </div>

      <ToolArticle>
        <h2>{m["tools.qrCodeReader.articleWhatTitle"]()}</h2>
        <p>{m["tools.qrCodeReader.articleWhatBody"]()}</p>
        <h2>{m["tools.qrCodeReader.articleWhenTitle"]()}</h2>
        <p>{m["tools.qrCodeReader.articleWhenBody"]()}</p>
        <h2>{m["shared.barcodeTools.readerArticlePrivacyTitle"]()}</h2>
        <p>{m["tools.qrCodeReader.articlePrivacyBody"]()}</p>
        <h2>{m["tools.qrCodeReader.articleTipsTitle"]()}</h2>
        <ul>
          <li>{m["tools.qrCodeReader.articleTipClear"]()}</li>
          <li>{m["tools.qrCodeReader.articleTipLight"]()}</li>
          <li>{m["tools.qrCodeReader.articleTipSteady"]()}</li>
          <li>{m["tools.qrCodeReader.articleTipExport"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export function QrReader() {
  return (
    <ToolPage>
      <QrReaderContent />
    </ToolPage>
  );
}
