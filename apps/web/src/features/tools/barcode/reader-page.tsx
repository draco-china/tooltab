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
import { m } from "@/paraglide/messages.js";
import { useObjectUrl } from "@/hooks/use-object-url";
import { getLocale } from "@/paraglide/runtime.js";
import { readBarcodeFile } from "./reader-browser";
import { runBarcodeReaderWorker } from "./reader-worker-client";
import {
  BARCODE_PIXEL_LIMIT,
  type BarcodeReadResult,
} from "@workspace/tools/encoding/barcode-contract";

type ReaderResult = NonNullable<BarcodeReadResult> & {
  source: "image" | "camera";
};

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
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

function formatBarcodeFormat(format: string) {
  return format
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2");
}

function readerErrorMessage(error: unknown, locale: "zh-CN" | "en-US") {
  const code =
    error instanceof Error && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : String(error);
  if (code === "invalid_input")
    return m["shared.barcodeTools.readerInvalidFileTypeError"]({}, { locale });
  if (code === "too_large") return m["shared.barcode.toolarge"]({}, { locale });
  if (code === "timeout") return m["shared.barcode.timeout"]({}, { locale });
  if (code === "busy") return m["shared.barcode.busy"]({}, { locale });
  return m["shared.barcodeTools.readerDecodeImageError"]({}, { locale });
}

function CameraNotice({
  status,
  locale,
  errorMessage,
}: {
  status: CodeReaderCameraStatus;
  locale: "zh-CN" | "en-US";
  errorMessage: string;
}) {
  const details =
    status === "unsupported"
      ? [
          m["shared.barcodeTools.readerCameraUnsupportedTitle"]({}, { locale }),
          m["shared.barcodeTools.readerCameraUnsupportedDescription"](
            {},
            { locale },
          ),
        ]
      : status === "permission-denied"
        ? [
            m["shared.barcodeTools.readerCameraPermissionTitle"](
              {},
              { locale },
            ),
            m["shared.barcodeTools.readerCameraPermissionDescription"](
              {},
              { locale },
            ),
          ]
        : status === "error"
          ? [
              m["shared.barcodeTools.readerCameraErrorTitle"]({}, { locale }),
              errorMessage ||
                m["shared.barcodeTools.readerCameraErrorDescription"](
                  {},
                  { locale },
                ),
            ]
          : status === "scanning"
            ? [
                m["shared.barcodeTools.readerCameraScanningTitle"](
                  {},
                  { locale },
                ),
                m["shared.barcodeTools.readerCameraScanningDescription"](
                  {},
                  { locale },
                ),
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

function BarcodeReaderContent() {
  const locale = getLocale() as "zh-CN" | "en-US";
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
    ) => runBarcodeReaderWorker({ kind: "read", data, width, height }, signal),
    [],
  );
  const handleCameraResult = useCallback(
    (decoded: NonNullable<BarcodeReadResult>) => {
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
    markCameraUnsupported,
    startCamera,
    startTask,
    stopCamera,
    video,
  } = useCodeReaderResources({
    pixelLimit: BARCODE_PIXEL_LIMIT,
    readPixels: readCameraPixels,
    onCameraStart: () => setError(""),
    onCameraResult: handleCameraResult,
    frameError: m["shared.barcodeTools.readerCameraFrameError"]({}, { locale }),
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
        setError(
          m["shared.barcodeTools.readerInvalidFileTypeError"]({}, { locale }),
        );
        setDecoding(false);
        finishTask(controller);
        return;
      }
      try {
        const decoded = await readBarcodeFile(file, controller.signal);
        if (!isCurrentTask(controller)) return;
        if (decoded) setResult({ ...decoded, source: "image" });
        else
          setError(
            m["shared.barcodeTools.readerNoBarcodeFoundError"]({}, { locale }),
          );
      } catch (cause) {
        if (isCurrentTask(controller) && !controller.signal.aborted)
          setError(readerErrorMessage(cause, locale));
      } finally {
        if (isCurrentTask(controller)) {
          finishTask(controller);
          setDecoding(false);
        }
      }
    },
    [finishTask, isCurrentTask, locale, startTask],
  );

  const clearImage = useCallback(() => {
    abortTask();
    setSelectedFile(null);
    setDecoding(false);
    setError("");
    setResult((current) => (current?.source === "image" ? null : current));
  }, [abortTask]);

  const contentTypeLabels: Record<string, string> = {
    calendar: m["shared.barcodeTools.readerContentTypeCalendar"](
      {},
      { locale },
    ),
    email: m["shared.qrTools.email"]({}, { locale }),
    location: m["shared.qrTools.location"]({}, { locale }),
    phone: m["shared.qrTools.phone"]({}, { locale }),
    sms: m["shared.barcodeTools.readerContentTypeSms"]({}, { locale }),
    text: m["shared.aesTools.decrypttextplaintextlabel"]({}, { locale }),
    url: m["shared.barcodeTools.readerContentTypeUrl"]({}, { locale }),
    vcard: m["shared.barcodeTools.readerContentTypeVcard"]({}, { locale }),
    wifi: m["shared.qrTools.wifi"]({}, { locale }),
  };

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-6">
        <ToolPanelCard>
          <PanelHeader
            title={m["shared.barcodeTools.readerSourceTitle"]({}, { locale })}
            description={m["shared.barcodeTools.readerSourceDescription"](
              {},
              { locale },
            )}
          />
          <ToolPanelCardContent className="py-4">
            <ToggleButtonGroup
              selectionMode="single"
              aria-label={m["shared.barcodeTools.readerSourceTitle"](
                {},
                { locale },
              )}
              className="w-full [&_button]:min-h-11 [&_button]:flex-1"
              selectedKeys={new Set([mode])}
              onSelectionChange={(selection) => {
                const next = String([...selection][0] ?? "");
                if (next !== "upload" && next !== "camera") return;
                if (next === "upload") stopCamera();
                else if (
                  typeof navigator.mediaDevices?.getUserMedia !== "function"
                )
                  markCameraUnsupported();
                setMode(next);
                setError("");
              }}
            >
              <ToggleButton id="upload">
                <ImageIcon aria-hidden className="size-4" />
                {m["shared.barcode.image"]({}, { locale })}
              </ToggleButton>
              <ToggleButton id="camera">
                <Camera aria-hidden className="size-4" />
                {m["shared.barcode.camera"]({}, { locale })}
              </ToggleButton>
            </ToggleButtonGroup>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
          {mode === "upload" ? (
            <ToolPanelCard>
              <PanelHeader
                title={m["shared.barcodeTools.readerUploadTitle"](
                  {},
                  { locale },
                )}
                description={m["shared.barcodeTools.readerUploadDescription"](
                  {},
                  { locale },
                )}
              />
              <ToolPanelCardContent className="gap-4 py-4">
                <ToolFilePicker
                  label={
                    selectedFile
                      ? m["common.change"]({}, { locale })
                      : m["shared.barcodeTools.readerChooseImageLabel"](
                          {},
                          { locale },
                        )
                  }
                  accept={["image/*"]}
                  fileName={selectedFile?.name}
                  clearLabel={m["common.faviconremoveimage"]({}, { locale })}
                  description={m[
                    "shared.barcodeTools.readerSupportedFormatsLabel"
                  ]({}, { locale })}
                  isDisabled={decoding}
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
                      <Chip variant="soft">
                        {m["shared.barcodeTools.readerSelectedImageLabel"](
                          {},
                          { locale },
                        )}
                      </Chip>
                      <Chip variant="secondary">
                        {formatFileSize(selectedFile.size, locale)}
                      </Chip>
                    </div>
                    {decoding ? (
                      <div
                        aria-busy="true"
                        aria-label={m[
                          "shared.barcodeTools.readerDecodingImageLabel"
                        ]({}, { locale })}
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
                title={m["shared.barcodeTools.readerCameraTitle"](
                  {},
                  { locale },
                )}
                description={m["shared.barcodeTools.readerCameraDescription"](
                  {},
                  { locale },
                )}
              />
              <ToolPanelCardContent className="gap-4 py-4">
                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-default">
                  <video
                    ref={video}
                    aria-label={m["shared.barcodeTools.readerCameraTitle"](
                      {},
                      { locale },
                    )}
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
                      ]({}, { locale })}
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
                        {m["shared.barcodeTools.readerCameraIdleTitle"](
                          {},
                          { locale },
                        )}
                      </p>
                      <p className="text-sm text-muted">
                        {m["shared.barcodeTools.readerCameraIdleDescription"](
                          {},
                          { locale },
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <CameraNotice
                  status={cameraStatus}
                  locale={locale}
                  errorMessage={cameraError}
                />
              </ToolPanelCardContent>
              <ToolPanelCardFooter className="justify-end gap-3">
                {cameraStatus === "scanning" ? (
                  <Button variant="outline" onPress={stopCamera}>
                    <Square aria-hidden className="size-4" />
                    {m["shared.barcodeTools.readerStopCameraLabel"](
                      {},
                      { locale },
                    )}
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
                      ? m["shared.barcodeTools.readerStartingCameraLabel"](
                          {},
                          { locale },
                        )
                      : m["shared.barcodeTools.readerStartCameraLabel"](
                          {},
                          { locale },
                        )}
                  </Button>
                )}
              </ToolPanelCardFooter>
            </ToolPanelCard>
          )}

          <ToolPanelCard aria-live="polite">
            <PanelHeader
              title={m["shared.barcodeTools.readerResultTitle"]({}, { locale })}
              description={m["shared.barcodeTools.readerResultDescription"](
                {},
                { locale },
              )}
            />
            <ToolPanelCardContent className="gap-4 py-4">
              {result ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Chip variant="soft">
                      {m["common.archiveformat"]({}, { locale })}:{" "}
                      {formatBarcodeFormat(result.format)}
                    </Chip>
                    <Chip variant="soft">
                      {m["common.uaFieldType"]({}, { locale })}:{" "}
                      {contentTypeLabels[result.kind] ??
                        m["shared.aesTools.decrypttextplaintextlabel"](
                          {},
                          { locale },
                        )}
                    </Chip>
                    <Chip variant="secondary">
                      {result.source === "camera"
                        ? m["shared.barcode.camera"]({}, { locale })
                        : m["shared.barcode.image"]({}, { locale })}
                    </Chip>
                  </div>
                  <CodeBlock
                    code={result.text}
                    title={m["shared.barcodeTools.readerDecodedContentLabel"](
                      {},
                      { locale },
                    )}
                    copyLabel={m["common.actions.copyResult"]({}, { locale })}
                    copiedLabel={m["common.actions.copied"]({}, { locale })}
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
                    {m["shared.barcodeTools.readerEmptyResultTitle"](
                      {},
                      { locale },
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {m["shared.barcodeTools.readerEmptyResultDescription"](
                      {},
                      { locale },
                    )}
                  </p>
                </div>
              )}
            </ToolPanelCardContent>
            {result ? (
              <ToolPanelCardFooter className="flex-wrap justify-end gap-3">
                {result.href ? (
                  <Link
                    href={result.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"
                  >
                    <ArrowRight aria-hidden className="size-4" />
                    {m["shared.barcodeTools.readerOpenResultLabel"](
                      {},
                      { locale },
                    )}
                  </Link>
                ) : (
                  <Button isDisabled size="sm" variant="outline">
                    <ArrowRight aria-hidden className="size-4" />
                    {m["shared.barcodeTools.readerOpenResultLabel"](
                      {},
                      { locale },
                    )}
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
                {m["shared.barcodeTools.readerErrorTitle"]({}, { locale })}
              </Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </div>

      <ToolArticle>
        <h2>
          {m["shared.barcodeTools.readerArticleWhatTitle"]({}, { locale })}
        </h2>
        <p>{m["shared.barcodeTools.readerArticleWhatBody"]({}, { locale })}</p>
        <h2>
          {m["shared.barcodeTools.readerArticleWhenTitle"]({}, { locale })}
        </h2>
        <p>{m["shared.barcodeTools.readerArticleWhenBody"]({}, { locale })}</p>
        <h2>
          {m["shared.barcodeTools.readerArticlePrivacyTitle"]({}, { locale })}
        </h2>
        <p>
          {m["shared.barcodeTools.readerArticlePrivacyBody"]({}, { locale })}
        </p>
        <h2>
          {m["shared.barcodeTools.readerArticleTipsTitle"]({}, { locale })}
        </h2>
        <ul>
          <li>
            {m["shared.barcodeTools.readerArticleTipClear"]({}, { locale })}
          </li>
          <li>
            {m["shared.barcodeTools.readerArticleTipLight"]({}, { locale })}
          </li>
          <li>
            {m["shared.barcodeTools.readerArticleTipQuiet"]({}, { locale })}
          </li>
          <li>
            {m["shared.barcodeTools.readerArticleTipCrop"]({}, { locale })}
          </li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export function BarcodeReader() {
  return (
    <ToolPage>
      <BarcodeReaderContent />
    </ToolPage>
  );
}

export default BarcodeReader;
