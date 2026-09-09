import type {
  MetadataGroup,
  MetadataResult,
} from "@workspace/tools/image/metadata";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Accordion, Alert, Button, Skeleton, Table } from "@heroui/react";
import { Eye, FileImage, Globe2, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { useObjectUrl } from "@/hooks/use-object-url";
import { getLocale } from "@/paraglide/runtime.js";
import {
  ImageMetadataError,
  MAX_IMAGE_BYTES,
} from "@workspace/tools/image/metadata-containers";
import { runImageMetadataWorker } from "../image-metadata/worker-client";

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/webp",
  "image/gif",
];
const SUPPORTED_IMAGE_TYPES = new Set(ACCEPTED_IMAGE_TYPES);
const SUPPORTED_IMAGE_EXTENSIONS = /\.(gif|heic|heif|jpe?g|png|tiff?|webp)$/i;
const FIELD_PREVIEW_LIMIT = 200;

function isSupportedImage(file: File) {
  return (
    SUPPORTED_IMAGE_TYPES.has(file.type) ||
    SUPPORTED_IMAGE_EXTENSIONS.test(file.name)
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unit]}`;
}

function errorMessage(error: unknown, locale: "zh-CN" | "en-US") {
  const code = error instanceof ImageMetadataError ? error.code : "";
  switch (code) {
    case "too_large":
      return m["tools.exifViewer.statesTooLarge"]({}, { locale });
    case "timeout":
      return m["tools.exifViewer.statesTimeout"]({}, { locale });
    case "unsupported":
      return m["tools.exifViewer.statesUnsupported"]({}, { locale });
    case "read_failed":
      return m["tools.exifViewer.statesReadFailed"]({}, { locale });
    default:
      return m["tools.exifViewer.parseError"]({}, { locale });
  }
}

function ExifViewerPageContent() {
  const locale = getLocale();
  const [selected, setSelected] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const imageUrl = useObjectUrl(selected);

  function invalidate() {
    revision.current += 1;
    controller.current?.abort();
    reader.current?.abort();
    controller.current = null;
    reader.current = null;
    setBusy(false);
  }

  function clearFile() {
    invalidate();
    setSelected(null);
    setMetadata(null);
    setError("");
    setPreviewFailed(false);
  }

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      reader.current?.abort();
    },
    [],
  );

  async function inspect(bytes: Uint8Array, current: number) {
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await runImageMetadataWorker(
        { kind: "inspect", bytes },
        abort.signal,
      );
      if (current === revision.current && result.kind === "metadata")
        setMetadata(result);
    } catch (cause) {
      if (current === revision.current && !abort.signal.aborted)
        setError(errorMessage(cause, locale));
    } finally {
      if (current === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  function selectFile(file: File) {
    clearFile();
    if (!isSupportedImage(file)) {
      setError(m["tools.exifViewer.unsupportedFile"]({}, { locale }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(m["tools.exifViewer.statesTooLarge"]({}, { locale }));
      return;
    }

    const current = revision.current;
    try {
      const nextReader = new FileReader();
      reader.current = nextReader;
      setSelected(file);
      setBusy(true);
      nextReader.onerror = () => {
        if (current !== revision.current) return;
        reader.current = null;
        setError(m["tools.exifViewer.statesReadFailed"]({}, { locale }));
        setBusy(false);
      };
      nextReader.onload = () => {
        if (current !== revision.current) return;
        reader.current = null;
        void inspect(new Uint8Array(nextReader.result as ArrayBuffer), current);
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
      setError(m["tools.exifViewer.statesReadFailed"]({}, { locale }));
    }
  }

  let remaining = FIELD_PREVIEW_LIMIT;
  const shownGroups =
    metadata?.groups
      .map((group) => {
        const entries = group.entries.slice(0, remaining);
        remaining -= entries.length;
        return { ...group, entries };
      })
      .filter((group) => group.entries.length > 0) ?? [];
  const truncated = Boolean(metadata && metadata.fields > FIELD_PREVIEW_LIMIT);

  return (
    <div className="grid gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,24rem)_1fr]">
        <div className="xl:sticky xl:top-6">
          <ToolPanelCard>
            <ToolPanelCardContent className="gap-5 py-4">
              {selected ? (
                <>
                  <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-default/30">
                    {imageUrl && !previewFailed ? (
                      <img
                        src={imageUrl}
                        alt={selected.name}
                        className="aspect-4/3 w-full object-contain p-3"
                        width={800}
                        height={600}
                        onError={() => setPreviewFailed(true)}
                      />
                    ) : (
                      <div className="flex aspect-4/3 items-center justify-center">
                        <FileImage aria-hidden className="size-8 text-muted" />
                        <span className="sr-only">
                          {m["tools.exifViewer.statesPreviewUnavailable"](
                            {},
                            { locale },
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-1">
                    <p className="text-sm text-muted">
                      {m["shared.barcodeTools.readerSelectedImageLabel"](
                        {},
                        { locale },
                      )}
                    </p>
                    <p className="font-medium break-all">{selected.name}</p>
                    <p className="text-sm text-muted">
                      {m["tools.audioRecorder.size"]({}, { locale })}:{" "}
                      {formatBytes(selected.size)}
                    </p>
                  </div>
                  <div className="**:data-source-dropzone:min-h-24 [&_label]:sr-only">
                    <ToolFilePicker
                      label={m["common.change"]({}, { locale })}
                      accept={ACCEPTED_IMAGE_TYPES}
                      onSelect={selectFile}
                    />
                  </div>
                  <Button type="button" variant="outline" onPress={clearFile}>
                    <Trash2 aria-hidden className="size-4" />
                    {m["common.faviconremoveimage"]({}, { locale })}
                  </Button>
                </>
              ) : (
                <div className="**:data-source-dropzone:min-h-72 [&_label]:sr-only">
                  <ToolFilePicker
                    label={m["shared.barcodeTools.readerChooseImageLabel"](
                      {},
                      { locale },
                    )}
                    description={m["tools.exifViewer.supportedFormats"](
                      {},
                      { locale },
                    )}
                    accept={ACCEPTED_IMAGE_TYPES}
                    onSelect={selectFile}
                  />
                </div>
              )}
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <ToolPanelCard>
          <ToolPanelCardContent className="gap-5 py-4">
            {busy ? (
              <MetadataSkeleton />
            ) : metadata?.fields ? (
              <MetadataResults
                metadata={metadata}
                groups={shownGroups}
                truncated={truncated}
              />
            ) : metadata ? (
              <EmptyResults
                icon={Eye}
                title={m["tools.exifViewer.noExifTitle"]({}, { locale })}
                description={m["tools.exifViewer.noExifDescription"](
                  {},
                  { locale },
                )}
              />
            ) : (
              <EmptyResults
                icon={Eye}
                title={m["tools.exifViewer.emptyTitle"]({}, { locale })}
                description={m["tools.exifViewer.emptyDescription"](
                  {},
                  { locale },
                )}
              />
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.exifViewer.errorTitle"]({}, { locale })}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolArticle>
        <h2>{m["tools.exifViewer.article.whatTitle"]({}, { locale })}</h2>
        <p>{m["tools.exifViewer.articleWhatBody"]({}, { locale })}</p>
        <h2>{m["tools.exifViewer.article.useCasesTitle"]({}, { locale })}</h2>
        <ul>
          {[
            m["tools.exifViewer.articleUseCases0"]({}, { locale }),
            m["tools.exifViewer.articleUseCases1"]({}, { locale }),
            m["tools.exifViewer.articleUseCases2"]({}, { locale }),
          ].map((useCase) => (
            <li key={useCase}>{useCase}</li>
          ))}
        </ul>
        <h2>{m["tools.exifViewer.article.privacyTitle"]({}, { locale })}</h2>
        <p>
          <strong>
            {m["tools.exifViewer.articlePrivacyReminderLabel"]({}, { locale })}
          </strong>{" "}
          {m["tools.exifViewer.articlePrivacyReminder"]({}, { locale })}
        </p>
        <p>{m["tools.exifViewer.articlePrivacyBody"]({}, { locale })}</p>
      </ToolArticle>
    </div>
  );
}

function MetadataSkeleton() {
  const locale = getLocale();
  return (
    <div
      className="grid min-h-72 content-start gap-5"
      role="status"
      aria-label={m["tools.exifViewer.readingMetadata"]({}, { locale })}
    >
      <span className="sr-only">
        {m["tools.exifViewer.readingMetadata"]({}, { locale })}.{" "}
        {m["tools.exifViewer.readingDescription"]({}, { locale })}
      </span>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

function EmptyResults({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Eye;
  title: string;
  description: string;
}) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon aria-hidden className="size-6 text-muted" />
      <div className="grid gap-1">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
    </section>
  );
}

function MetadataResults({
  metadata,
  groups,
  truncated,
}: {
  metadata: MetadataResult;
  groups: MetadataGroup[];
  truncated: boolean;
}) {
  const locale = getLocale();
  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="font-medium">
            {m["tools.exifViewer.metadataResults"]({}, { locale })}
          </h2>
          <p className="text-sm text-muted">
            {m["tools.exifViewer.resultsDescription"]({}, { locale })}
          </p>
        </div>
        <ToolCopyButton
          value={metadata.json}
          copyLabel={m["tools.exifViewer.copyAsJson"]({}, { locale })}
          copiedLabel={m["common.actions.copied"]({}, { locale })}
        />
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Metric
          label={m["tools.exifViewer.fieldsFound"]({}, { locale })}
          value={metadata.fields}
        />
        <Metric
          label={m["tools.exifViewer.categoriesFound"]({}, { locale })}
          value={metadata.groups.length}
        />
        <Metric
          label={m["tools.exifViewer.gpsStatus"]({}, { locale })}
          value={
            metadata.gps
              ? m["tools.exifViewer.gpsAvailable"]({}, { locale })
              : m["tools.exifViewer.gpsUnavailable"]({}, { locale })
          }
        />
      </dl>

      {metadata.gps ? (
        <div className="flex flex-wrap gap-2">
          <MapLink
            href={`https://www.google.com/maps?q=${metadata.gps.latitude},${metadata.gps.longitude}`}
            label={m["tools.exifViewer.openInGoogleMaps"]({}, { locale })}
          />
          {locale.startsWith("zh") ? (
            <MapLink
              href={`https://uri.amap.com/marker?position=${metadata.gps.longitude},${metadata.gps.latitude}`}
              label={m["tools.exifViewer.openInAmap"]({}, { locale })}
            />
          ) : null}
        </div>
      ) : null}

      {metadata.warnings.length ? (
        <Alert status="warning">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description>
              {m["tools.exifViewer.statesWarning"]({}, { locale })}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Accordion
        allowsMultipleExpanded
        defaultExpandedKeys={groups.map((group) => group.id)}
        className="overflow-hidden rounded-xl border border-border"
      >
        {groups.map((group) => (
          <MetadataGroupTable key={group.id} group={group} />
        ))}
      </Accordion>
      {truncated ? (
        <p className="text-sm text-muted">
          {m["tools.exifViewer.statesPreviewTruncated"]({}, { locale })}
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-medium">{value}</dd>
    </div>
  );
}

function MapLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Globe2 aria-hidden className="size-4" />
      {label}
    </a>
  );
}

function MetadataGroupTable({ group }: { group: MetadataGroup }) {
  const locale = getLocale();
  const categoryLabel =
    group.id === "basic"
      ? m["common.imbasic"]({}, { locale })
      : group.id === "camera"
        ? m["tools.exifViewer.categoryCamera"]({}, { locale })
        : group.id === "gps"
          ? m["tools.exifViewer.categoryGps"]({}, { locale })
          : m["tools.exifViewer.categoryAdvanced"]({}, { locale });
  return (
    <Accordion.Item id={group.id}>
      <Accordion.Heading>
        <Accordion.Trigger className="px-4">
          <span>{categoryLabel}</span>
          <span className="rounded-full bg-default px-2 py-0.5 text-xs text-muted">
            {group.entries.length}
          </span>
          <Accordion.Indicator />
        </Accordion.Trigger>
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body className="border-t border-border p-0">
          <Table variant="secondary">
            <Table.ScrollContainer>
              <Table.Content aria-label={categoryLabel}>
                <Table.Header>
                  <Table.Column id="field" isRowHeader>
                    {m["tools.cronExpressionParser.breakdownField"](
                      {},
                      { locale },
                    )}
                  </Table.Column>
                  <Table.Column id="value">
                    {m["tools.cronExpressionParser.breakdownValue"](
                      {},
                      { locale },
                    )}
                  </Table.Column>
                </Table.Header>
                <Table.Body>
                  {group.entries.map((entry) => {
                    const id = `${entry.source}:${entry.key}`;
                    return (
                      <Table.Row key={id} id={id}>
                        <Table.Cell className="max-w-48 font-mono text-xs break-all">
                          {entry.key}
                        </Table.Cell>
                        <Table.Cell className="min-w-64 font-mono text-xs break-all whitespace-pre-wrap">
                          {entry.description.slice(0, 1000)}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function ExifViewerPage() {
  return (
    <ToolPage>
      <ExifViewerPageContent />
    </ToolPage>
  );
}
