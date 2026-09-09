import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, Skeleton, Table } from "@heroui/react";
import { Download, Eye, FileText, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { MAX_PDF_INPUT, PdfEditingError } from "@workspace/tools/pdf/core";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import type { InfoResult, ReadingSource } from "@workspace/tools/pdf/reading";
import { runReadingWorker } from "./worker-client";

type FileSummary = InfoResult["file"];
type Row = { id: string; label: string; value: string };

const PDF_EXTENSION = /\.pdf$/iu;

function PdfInfoViewerPageContent() {
  const locale = getLocale();
  const readerRef = useRef<FileReader | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const jsonUrlRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const [file, setFile] = useState<FileSummary | null>(null);
  const [info, setInfo] = useState<InfoResult | null>(null);
  const [jsonUrl, setJsonUrl] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState("");

  const revokeJson = () => {
    if (jsonUrlRef.current) URL.revokeObjectURL(jsonUrlRef.current);
    jsonUrlRef.current = null;
    setJsonUrl(null);
  };
  const cancelActive = () => {
    revisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    const reader = readerRef.current;
    if (reader?.readyState === FileReader.LOADING) reader.abort();
    bytesRef.current?.fill(0);
    bytesRef.current = null;
  };
  const clear = () => {
    cancelActive();
    revokeJson();
    setFile(null);
    setInfo(null);
    setError("");
    setIsReading(false);
  };

  useEffect(
    () => () => {
      revisionRef.current += 1;
      controllerRef.current?.abort();
      const reader = readerRef.current;
      if (reader?.readyState === FileReader.LOADING) reader.abort();
      readerRef.current = null;
      bytesRef.current?.fill(0);
      bytesRef.current = null;
      if (jsonUrlRef.current) URL.revokeObjectURL(jsonUrlRef.current);
      jsonUrlRef.current = null;
    },
    [],
  );

  const choose = async (selected: File | undefined) => {
    if (!selected) return;
    cancelActive();
    revokeJson();
    setInfo(null);
    setError("");
    setIsReading(false);
    if (!isPdfFile(selected)) {
      setFile(null);
      setError(m["tools.pdfInfoViewer.unsupportedFile"]());
      return;
    }
    if (!selected.size || selected.size > MAX_PDF_INPUT) {
      setFile(null);
      setError(m["tools.pdfInfoViewer.parseError"]());
      return;
    }

    const run = revisionRef.current;
    const sourceFile = fileSummary(selected);
    let sourceBytes: Uint8Array | null = null;
    setFile(sourceFile);
    setIsReading(true);
    try {
      const buffer = await readFile(selected, readerRef);
      const bytes = new Uint8Array(buffer);
      sourceBytes = bytes;
      if (run !== revisionRef.current) {
        bytes.fill(0);
        return;
      }
      bytesRef.current = bytes;
      const controller = new AbortController();
      controllerRef.current = controller;
      const source: ReadingSource = {
        bytes,
        name: sourceFile.name,
        type: sourceFile.type,
        lastModified: selected.lastModified,
      };
      const result = await runReadingWorker(
        { kind: "info", source },
        controller.signal,
      );
      if (run !== revisionRef.current || result.kind !== "info") return;
      setInfo(result);
      const json = JSON.stringify(stripKind(result), null, 2);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      jsonUrlRef.current = url;
      setJsonUrl(url);
    } catch (cause) {
      if (run === revisionRef.current) {
        setError(errorMessage(cause, m["tools.pdfInfoViewer.parseError"]()));
      }
    } finally {
      if (run === revisionRef.current) {
        setIsReading(false);
        controllerRef.current = null;
      }
      sourceBytes?.fill(0);
      if (bytesRef.current === sourceBytes) {
        bytesRef.current = null;
      }
    }
  };

  const json = info ? JSON.stringify(stripKind(info), null, 2) : "";

  return (
    <>
      <div
        className="grid items-stretch gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <div className="xl:sticky xl:top-6">
          <ToolPanelCard className="h-full">
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["tools.pdfInfoViewer.selectedPdf"]()}</Card.Title>
              <Card.Description>
                {m["tools.pdfInfoViewer.supportedFormats"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-5 py-4">
              <ToolFilePicker
                label={
                  file
                    ? m["tools.pdfInfoViewer.changeFile"]()
                    : m["tools.pdfInfoViewer.dragDropOrClick"]()
                }
                description={m["tools.pdfInfoViewer.supportedFormats"]()}
                accept={["application/pdf", ".pdf"]}
                fileName={
                  file ? `${file.name} · ${formatBytes(file.size)}` : undefined
                }
                clearLabel={m["shared.aesTools.clearfile"]()}
                isDisabled={isReading}
                onSelect={(selected) => void choose(selected)}
                onClear={file ? clear : undefined}
              />
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <ToolPanelCard className="h-full">
          <ToolPanelCardContent className="gap-5 py-4">
            {isReading ? (
              <ResultsSkeleton />
            ) : info ? (
              <InfoResults
                info={info}
                json={json}
                jsonUrl={jsonUrl}
                locale={locale}
              />
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-default text-muted">
                  <Eye aria-hidden className="size-5" />
                </span>
                <h2 className="font-medium">
                  {m["tools.pdfInfoViewer.noFileTitle"]()}
                </h2>
                <p className="max-w-md text-sm text-muted">
                  {m["tools.pdfInfoViewer.noFileDescription"]()}
                </p>
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      {error ? (
        <Alert status="danger" className="mt-6" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>{m["tools.pdfInfoViewer.errorTitle"]()}</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolArticle className="mt-8">
        <h2>{m["tools.exifViewer.article.whatTitle"]()}</h2>
        <p>{m["tools.pdfInfoViewer.article.what"]()}</p>
        <h2>{m["tools.exifViewer.article.useCasesTitle"]()}</h2>
        <ul>
          {[
            m["tools.pdfInfoViewer.article.useCases0"](),
            m["tools.pdfInfoViewer.article.useCases1"](),
            m["tools.pdfInfoViewer.article.useCases2"](),
            m["tools.pdfInfoViewer.article.useCases3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.exifViewer.article.privacyTitle"]()}</h2>
        <p>{m["tools.pdfInfoViewer.article.privacy"]()}</p>
        <h2>{m["tools.pdfInfoViewer.article.limitationsTitle"]()}</h2>
        <p>{m["tools.pdfInfoViewer.article.limitations"]()}</p>
      </ToolArticle>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid min-h-72 gap-5" role="status">
      <div className="grid gap-1">
        <h2 className="font-medium">
          {m["tools.pdfInfoViewer.readingTitle"]()}
        </h2>
        <p className="text-sm text-muted">
          {m["tools.pdfInfoViewer.readingDescription"]()}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          m["shared.pdfEditing.pages"](),
          m["shared.pdfEditing.readfieldVersion"](),
          m["tools.pdfInfoViewer.encryptionStatus"](),
        ].map((label) => (
          <div key={label} className="grid gap-2 p-3">
            <span className="text-sm text-muted">{label}</span>
            <Skeleton className="h-7 w-2/3 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 p-4">
        <Skeleton className="h-5 w-1/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-3/4 rounded-lg" />
      </div>
    </div>
  );
}

function InfoResults({
  info,
  json,
  jsonUrl,
  locale,
}: {
  info: InfoResult;
  json: string;
  jsonUrl: string | null;
  locale: string;
}) {
  const fileRows = getFileRows(info, locale);
  const documentRows = getDocumentRows(info);
  const metadataRows = getMetadataRows(info, locale);
  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">
            {m["tools.pdfInfoViewer.documentResults"]()}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {m["tools.pdfInfoViewer.resultsDescription"]()}
          </p>
        </div>
        <ToolPanelActionGroup className="sm:justify-end">
          <ToolCopyButton
            value={json}
            copyLabel={m["tools.exifViewer.copyAsJson"]()}
            copiedLabel={m["common.actions.copied"]()}
            className="w-full"
          />
          {jsonUrl ? (
            <a
              href={jsonUrl}
              download={`${info.file.name}.json`}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-default"
            >
              <Download aria-hidden className="size-4" />
              {m["shared.aesTools.encryptdownloadjsonlabel"]()}
            </a>
          ) : null}
        </ToolPanelActionGroup>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Metric
          label={m["shared.pdfEditing.pages"]()}
          value={metric(info.document.pageCount)}
        />
        <Metric
          label={m["shared.pdfEditing.readfieldVersion"]()}
          value={
            info.document.version ?? m["tools.bicSwiftValidator.notAvailable"]()
          }
        />
        <Metric
          label={m["tools.pdfInfoViewer.encryptionStatus"]()}
          value={
            info.document.encrypted
              ? m["common.archiveencrypted"]()
              : m["tools.pdfInfoViewer.notEncrypted"]()
          }
        />
      </dl>

      {info.document.encrypted ? (
        <Alert status="warning">
          <Alert.Indicator>
            <Lock aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.pdfInfoViewer.encryptedTitle"]()}
            </Alert.Title>
            <Alert.Description>
              {m["tools.pdfInfoViewer.encryptedDescription"]()}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <InfoSection
        title={m["tools.pdfInfoViewer.sectionFile"]()}
        rows={fileRows}
      />
      <InfoSection
        title={m["tools.pdfInfoViewer.sectionDocument"]()}
        rows={documentRows}
      />
      {metadataRows.length ? (
        <InfoSection
          title={m["tools.pdfInfoViewer.sectionMetadata"]()}
          rows={metadataRows}
        />
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/30 p-6 text-center">
          <FileText aria-hidden className="size-5 text-muted" />
          <h3 className="font-medium">
            {m["tools.pdfInfoViewer.noMetadataTitle"]()}
          </h3>
          <p className="max-w-md text-sm text-muted">
            {m["tools.pdfInfoViewer.noMetadataDescription"]()}
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 min-h-7 text-lg font-medium wrap-break-word">
        {value}
      </dd>
    </div>
  );
}

function InfoSection({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex items-center justify-between gap-3 border-b border-separator px-4 py-3">
        <h3 className="font-medium">{title}</h3>
        <Chip size="sm" variant="secondary">
          {rows.length}
        </Chip>
      </header>
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label={title}>
            <Table.Header>
              <Table.Column id="field" isRowHeader className="w-40 sm:w-48">
                {m["tools.cronExpressionParser.breakdownField"]()}
              </Table.Column>
              <Table.Column id="value">
                {m["tools.cronExpressionParser.breakdownValue"]()}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="align-top font-medium whitespace-normal">
                    {row.label}
                  </Table.Cell>
                  <Table.Cell className="align-top wrap-break-word whitespace-normal">
                    {row.value}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </section>
  );
}

function getFileRows(info: InfoResult, locale: string): Row[] {
  return rowsWithFallback(
    [
      ["file-name", m["common.datauriFilename"](), info.file.name],
      [
        "file-size",
        m["tools.audioRecorder.size"](),
        formatBytes(info.file.size),
      ],
      ["file-type", m["tools.pdfInfoViewer.fieldFileType"](), info.file.type],
      [
        "file-modified",
        m["tools.pdfInfoViewer.fieldLastModified"](),
        formatDateTime(info.file.lastModified, locale),
      ],
    ],
    m["tools.bicSwiftValidator.notAvailable"](),
  );
}

function getDocumentRows(info: InfoResult): Row[] {
  return rowsWithFallback(
    [
      [
        "page-count",
        m["tools.pdfInfoViewer.fieldPageCount"](),
        metric(info.document.pageCount),
      ],
      [
        "pdf-version",
        m["shared.pdfEditing.readfieldVersion"](),
        info.document.version,
      ],
      [
        "encrypted",
        m["common.archiveencrypted"](),
        info.document.encrypted
          ? m["common.archiveencrypted"]()
          : m["tools.pdfInfoViewer.notEncrypted"](),
      ],
      [
        "first-page-size",
        m["tools.pdfInfoViewer.fieldFirstPageSize"](),
        formatPageSize(info.document.firstPageSize),
      ],
    ],
    m["tools.bicSwiftValidator.notAvailable"](),
  );
}

function getMetadataRows(info: InfoResult, locale: string): Row[] {
  return rowsWithFallback(
    [
      [
        "title",
        m["shared.pdfEditing.readfieldTitle"](),
        info.metadata.title as string | undefined,
      ],
      [
        "author",
        m["shared.pdfEditing.readfieldAuthor"](),
        info.metadata.author as string | undefined,
      ],
      [
        "subject",
        m["shared.pdfEditing.readfieldSubject"](),
        info.metadata.subject as string | undefined,
      ],
      [
        "keywords",
        m["shared.pdfEditing.readfieldKeywords"](),
        Array.isArray(info.metadata.keywords)
          ? info.metadata.keywords.join(", ")
          : (info.metadata.keywords as string | undefined),
      ],
      [
        "creator",
        m["shared.pdfEditing.readfieldCreator"](),
        info.metadata.creator as string | undefined,
      ],
      [
        "producer",
        m["shared.pdfEditing.readfieldProducer"](),
        info.metadata.producer as string | undefined,
      ],
      [
        "created",
        m["tools.pdfInfoViewer.fieldCreationDate"](),
        formatDateTime(
          info.metadata.creationDate as string | undefined,
          locale,
        ),
      ],
      [
        "modified",
        m["tools.pdfInfoViewer.fieldModificationDate"](),
        formatDateTime(
          info.metadata.modificationDate as string | undefined,
          locale,
        ),
      ],
    ],
    m["tools.bicSwiftValidator.notAvailable"](),
  ).filter((row) => row.value !== m["tools.bicSwiftValidator.notAvailable"]());
}

function rowsWithFallback(
  rows: Array<[string, string, string | undefined]>,
  fallback: string,
) {
  return rows.map(([id, label, value]) => ({
    id,
    label,
    value: value || fallback,
  }));
}

function fileSummary(file: File): FileSummary {
  return {
    name: file.name,
    size: file.size,
    type: file.type || "application/pdf",
    ...(file.lastModified
      ? { lastModified: new Date(file.lastModified).toISOString() }
      : {}),
  };
}

function isPdfFile(file: Pick<File, "name" | "type">) {
  return file.type === "application/pdf" || PDF_EXTENSION.test(file.name);
}

function readFile(
  file: File,
  target: React.MutableRefObject<FileReader | null>,
) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    target.current = reader;
    const finish = () => {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (target.current === reader) target.current = null;
    };
    reader.onload = () => {
      const result = reader.result;
      finish();
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error("Invalid FileReader result"));
    };
    reader.onerror = () => {
      const reason = reader.error ?? new Error("FileReader failed");
      finish();
      reject(reason);
    };
    reader.onabort = () => {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    };
    reader.readAsArrayBuffer(file);
  });
}

function stripKind(info: InfoResult) {
  const { kind: _kind, ...result } = info;
  return result;
}

function metric(value: number | undefined) {
  return value === undefined
    ? m["tools.bicSwiftValidator.notAvailable"]()
    : String(value);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
}

function formatDateTime(value: string | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPageSize(size: { width: number; height: number } | undefined) {
  if (!size) return "";
  return `${formatNumber(size.width)} x ${formatNumber(size.height)} pt (${(size.width / 72).toFixed(2)} x ${(size.height / 72).toFixed(2)} in)`;
}

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/u, "");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof PdfEditingError || error instanceof DOMException) {
    return fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function PdfInfoViewerPage() {
  return (
    <ToolPage>
      <PdfInfoViewerPageContent />
    </ToolPage>
  );
}
