import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card } from "@heroui/react";
import { Download, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { imageFormat } from "@workspace/tools/image/metadata-containers";
import {
  ImageMetadataError,
  MAX_IMAGE_BYTES,
} from "@workspace/tools/image/metadata-containers";
import { runImageMetadataWorker } from "../image-metadata/worker-client";

type SelectedImage = {
  name: string;
  bytes: Uint8Array;
  format: "jpeg" | "png" | "webp";
  size: number;
};

function ImageMetadataCleanerPageContent() {
  const locale = getLocale();
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [cleanedSize, setCleanedSize] = useState(0);
  const [removedBytes, setRemovedBytes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const reader = useRef<FileReader | null>(null);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  function makeUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  }

  function releaseUrls() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
  }

  function invalidate() {
    revision.current += 1;
    reader.current?.abort();
    controller.current?.abort();
    reader.current = null;
    controller.current = null;
    setBusy(false);
  }

  function clear() {
    invalidate();
    releaseUrls();
    setSelected(null);
    setSelectedUrl(null);
    setCleanedUrl(null);
    setCleanedSize(0);
    setRemovedBytes(0);
    setError("");
  }

  useEffect(
    () => () => {
      revision.current += 1;
      reader.current?.abort();
      controller.current?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    },
    [],
  );

  function selectFile(file: File) {
    clear();
    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        m["tools.imageMetadataCleaner.unsupportedFormat"]({}, { locale }),
      );
      return;
    }
    const current = revision.current;
    try {
      const nextReader = new FileReader();
      reader.current = nextReader;
      setBusy(true);
      nextReader.onerror = () => {
        if (current === revision.current) {
          reader.current = null;
          setBusy(false);
          setError(
            m["tools.imageMetadataCleaner.cleaningFailed"]({}, { locale }),
          );
        }
      };
      nextReader.onload = () => {
        if (current !== revision.current) return;
        try {
          const bytes = new Uint8Array(nextReader.result as ArrayBuffer);
          const format = imageFormat(bytes);
          if (format !== "jpeg" && format !== "png" && format !== "webp") {
            throw new ImageMetadataError("unsupported_format");
          }
          setSelected({ name: file.name, bytes, format, size: file.size });
          setSelectedUrl(makeUrl(file));
        } catch {
          setError(
            m["tools.imageMetadataCleaner.unsupportedFormat"]({}, { locale }),
          );
        } finally {
          if (current === revision.current) {
            reader.current = null;
            setBusy(false);
          }
        }
      };
      nextReader.readAsArrayBuffer(file);
    } catch {
      if (current !== revision.current) return;
      const failedReader = reader.current;
      reader.current = null;
      if (failedReader) {
        failedReader.onload = null;
        failedReader.onerror = null;
        failedReader.abort();
      }
      setBusy(false);
      setError(m["tools.imageMetadataCleaner.cleaningFailed"]({}, { locale }));
    }
  }

  async function clean() {
    if (!selected || busy) return;
    controller.current?.abort();
    if (cleanedUrl) {
      URL.revokeObjectURL(cleanedUrl);
      urls.current = urls.current.filter((url) => url !== cleanedUrl);
    }
    setCleanedUrl(null);
    setError("");
    const current = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const result = await runImageMetadataWorker(
        { kind: "clean", bytes: selected.bytes },
        abort.signal,
      );
      if (current !== revision.current || result.kind !== "cleaned") return;
      const blob = new Blob([new Uint8Array(result.bytes)], {
        type: `image/${result.format}`,
      });
      setCleanedSize(blob.size);
      setRemovedBytes(result.removedBytes);
      setCleanedUrl(makeUrl(blob));
    } catch (cause) {
      if (!abort.signal.aborted && current === revision.current) {
        setError(
          cause instanceof ImageMetadataError &&
            cause.code === "unsupported_format"
            ? m["tools.imageMetadataCleaner.unsupportedFormat"]({}, { locale })
            : m["tools.imageMetadataCleaner.cleaningFailed"]({}, { locale }),
        );
      }
    } finally {
      if (current === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  function download() {
    if (!cleanedUrl || !selected) return;
    const anchor = document.createElement("a");
    anchor.href = cleanedUrl;
    anchor.download = selected.name;
    anchor.click();
  }

  const reduction = selected?.size
    ? Math.max(0, Math.round((removedBytes / selected.size) * 100))
    : 0;
  const formatBytes = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      value < 1024 ? value : value / 1024,
    ) + (value < 1024 ? " B" : " KB");

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.imageMetadataCleaner.dragDropOrClick"]({}, { locale })}
            </Card.Title>
            <Card.Description>
              {m["tools.imageMetadataCleaner.supportedFormats"]({}, { locale })}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <ToolFilePicker
              label={m["tools.imageMetadataCleaner.dragDropOrClick"](
                {},
                { locale },
              )}
              description={m["tools.imageMetadataCleaner.supportedFormats"](
                {},
                { locale },
              )}
              accept={["image/jpeg", "image/png", "image/webp"]}
              fileName={selected?.name}
              clearLabel={m["common.formatremove"]({}, { locale })}
              isDisabled={busy}
              onSelect={selectFile}
              onClear={clear}
            />
            {selected && selectedUrl ? (
              <div className="overflow-hidden rounded-xl border border-border bg-default/30">
                <img
                  src={selectedUrl}
                  alt={selected.name}
                  className="aspect-video w-full object-contain"
                />
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-default text-muted">
                <Wrench aria-hidden className="size-5" />
              </span>
              <h2 className="font-medium">
                {m["common.imclean"]({}, { locale })}
              </h2>
              <p className="text-sm text-muted">
                {m["tools.imageMetadataCleaner.note"]({}, { locale })}
              </p>
            </div>
            <Button
              className="w-full"
              isDisabled={!selected || busy}
              onPress={() => void clean()}
            >
              {busy
                ? m["tools.imageMetadataCleaner.cleaningMetadata"](
                    {},
                    { locale },
                  )
                : m["common.imclean"]({}, { locale })}
            </Button>
            {selected && cleanedUrl ? (
              <dl className="grid gap-3 text-sm">
                {[
                  [
                    m["tools.imageMetadataCleaner.removed"]({}, { locale }),
                    formatBytes(removedBytes),
                  ],
                  [
                    m["tools.imageMetadataCleaner.reduction"]({}, { locale }),
                    `${reduction}%`,
                  ],
                  [
                    m["tools.audioRecorder.size"]({}, { locale }),
                    `${formatBytes(cleanedSize)} / ${formatBytes(selected.size)}`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-border bg-default/30 p-3"
                  >
                    <dt className="text-muted">{label}</dt>
                    <dd className="mt-1 text-lg font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-default/30 p-4 text-center text-sm text-muted">
                {m["tools.imageMetadataCleaner.results"]({}, { locale })}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 p-4"
        >
          <p className="font-medium text-danger">
            {m["common.fmtseverityerror"]({}, { locale })}
          </p>
          <p className="mt-1 text-sm text-danger">{error}</p>
        </div>
      ) : null}

      {selected && selectedUrl && cleanedUrl ? (
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>
                {m["tools.imageMetadataCleaner.results"]({}, { locale })}
              </Card.Title>
              <Card.Description>
                {m["tools.imageMetadataCleaner.cleaningComplete"](
                  {},
                  { locale },
                )}
              </Card.Description>
            </div>
            <Button onPress={download} size="sm">
              <Download aria-hidden className="size-4" />
              {m["tools.imageMetadataCleaner.downloadCleaned"]({}, { locale })}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="grid gap-4 py-4 lg:grid-cols-2">
            {[
              [selected.name, selectedUrl],
              [
                m["tools.imageMetadataCleaner.downloadCleaned"]({}, { locale }),
                cleanedUrl,
              ],
            ].map(([label, url]) => (
              <div key={label} className="grid min-w-0 gap-2">
                <p className="truncate text-sm font-medium text-muted">
                  {label}
                </p>
                <div className="overflow-hidden rounded-xl border border-border bg-default/30">
                  <img
                    src={url}
                    alt={label}
                    className="aspect-video w-full object-contain"
                  />
                </div>
              </div>
            ))}
          </ToolPanelCardContent>
        </ToolPanelCard>
      ) : null}

      <ToolArticle>
        <h2>{m["shared.asciiArt.article.whatTitle"]({}, { locale })}</h2>
        <p>{m["tools.imageMetadataCleaner.articleWhatBody"]({}, { locale })}</p>
        <h2>
          {m["tools.imageMetadataCleaner.article.useTitle"]({}, { locale })}
        </h2>
        <ul>
          {[
            m["tools.imageMetadataCleaner.articleUseItems0"]({}, { locale }),
            m["tools.imageMetadataCleaner.articleUseItems1"]({}, { locale }),
            m["tools.imageMetadataCleaner.articleUseItems2"]({}, { locale }),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>
          {m["tools.imageMetadataCleaner.articleUnchangedTitle"](
            {},
            { locale },
          )}
        </h2>
        <ul>
          {[
            m["tools.imageMetadataCleaner.articleUnchangedItems0"](
              {},
              { locale },
            ),
            m["tools.imageMetadataCleaner.articleUnchangedItems1"](
              {},
              { locale },
            ),
            m["tools.imageMetadataCleaner.articleUnchangedItems2"](
              {},
              { locale },
            ),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export function ImageMetadataCleanerPage() {
  return (
    <ToolPage>
      <ImageMetadataCleanerPageContent />
    </ToolPage>
  );
}
