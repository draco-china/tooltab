import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Label, Skeleton, TextArea } from "@heroui/react";
import { Download, Eye, FileText, TriangleAlert } from "lucide-react";
import type { MutableRefObject, ReactNode } from "react";
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
import type { TextResult } from "@workspace/tools/pdf/reading";
import type { ReadingSource } from "@workspace/tools/pdf/reading";
import { runReadingWorker } from "./worker-client";

type SelectedFile = { name: string; size: number };

const PDF_EXTENSION = /\.pdf$/iu;

function PdfTextExtractorPageContent() {
  const locale = getLocale();
  const readerRef = useRef<FileReader | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingBytesRef = useRef<Uint8Array | null>(null);
  const downloadUrlRef = useRef("");
  const revisionRef = useRef(0);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [result, setResult] = useState<TextResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      revisionRef.current += 1;
      controllerRef.current?.abort();
      const reader = readerRef.current;
      if (reader?.readyState === FileReader.LOADING) reader.abort();
      readerRef.current = null;
      pendingBytesRef.current?.fill(0);
      pendingBytesRef.current = null;
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
      downloadUrlRef.current = "";
    },
    [],
  );

  function revokeDownload() {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
    }
    downloadUrlRef.current = "";
    setDownloadUrl("");
  }

  function cancelActive() {
    revisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    const reader = readerRef.current;
    if (reader?.readyState === FileReader.LOADING) reader.abort();
    readerRef.current = null;
    pendingBytesRef.current?.fill(0);
    pendingBytesRef.current = null;
  }

  function clearFile() {
    cancelActive();
    revokeDownload();
    setFile(null);
    setResult(null);
    setIsExtracting(false);
    setError("");
  }

  async function selectFile(selected: File | undefined) {
    if (!selected) return;
    cancelActive();
    revokeDownload();
    setResult(null);
    setError("");
    setIsExtracting(false);

    if (!isPdfFile(selected)) {
      setFile(null);
      setError(m["tools.pdfInfoViewer.unsupportedFile"]());
      return;
    }
    if (!selected.size || selected.size > MAX_PDF_INPUT) {
      setFile(null);
      setError(m["tools.pdfTextExtractor.parseError"]());
      return;
    }

    const selectedFile = { name: selected.name, size: selected.size };
    const currentRevision = revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setFile(selectedFile);
    setIsExtracting(true);
    let bytes: Uint8Array | null = null;
    try {
      bytes = new Uint8Array(
        await readFile(selected, controller.signal, readerRef),
      );
      pendingBytesRef.current = bytes;
      if (currentRevision !== revisionRef.current) {
        bytes.fill(0);
        return;
      }
      const source: ReadingSource = {
        bytes,
        name: selectedFile.name,
        type: selected.type || "application/pdf",
        lastModified: selected.lastModified,
      };
      const next = await runReadingWorker(
        { kind: "text", source },
        controller.signal,
      );
      if (
        currentRevision !== revisionRef.current ||
        controller.signal.aborted ||
        next.kind !== "text"
      ) {
        return;
      }
      setResult(next);
      if (next.text) {
        const url = URL.createObjectURL(
          new Blob([next.text], { type: "text/plain;charset=utf-8" }),
        );
        downloadUrlRef.current = url;
        setDownloadUrl(url);
      }
    } catch (cause) {
      if (
        currentRevision === revisionRef.current &&
        !controller.signal.aborted
      ) {
        setError(toErrorMessage(cause));
      }
    } finally {
      bytes?.fill(0);
      if (pendingBytesRef.current === bytes) pendingBytesRef.current = null;
      if (currentRevision === revisionRef.current) {
        controllerRef.current = null;
        setIsExtracting(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6" data-tool="pdf-text-extractor">
      <Alert status="warning">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {m["tools.pdfTextExtractor.extractionNoticeTitle"]()}
          </Alert.Title>
          <Alert.Description>
            {m["tools.pdfTextExtractor.extractionNotice"]()}
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-6 xl:self-start">
          <ToolPanelCard>
            <ToolPanelCardContent className="gap-5 py-4">
              <div className="grid min-h-72 content-center gap-4">
                {file ? (
                  <p className="font-medium">
                    {m["tools.pdfTextExtractor.selectedPdf"]()}
                  </p>
                ) : null}
                <ToolFilePicker
                  accept={["application/pdf", ".pdf"]}
                  clearLabel={m["shared.aesTools.clearfile"]()}
                  description={m["tools.pdfInfoViewer.supportedFormats"]()}
                  fileName={file?.name}
                  label={
                    file
                      ? m["tools.pdfInfoViewer.changeFile"]()
                      : m["tools.pdfInfoViewer.dragDropOrClick"]()
                  }
                  onClear={file ? clearFile : undefined}
                  onSelect={(selected) => void selectFile(selected)}
                />
                {file ? (
                  <dl className="rounded-xl border border-border bg-surface p-3 text-sm">
                    <dt className="text-muted">
                      {m["tools.audioRecorder.size"]()}
                    </dt>
                    <dd className="mt-1 font-medium">
                      {formatBytes(file.size, locale)}
                    </dd>
                  </dl>
                ) : null}
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <ToolPanelCard>
          <ToolPanelCardContent className="gap-5 py-4">
            {isExtracting ? (
              <ResultsSkeleton />
            ) : result ? (
              <TextResults
                downloadFileName={createTextDownloadFileName(file?.name ?? "")}
                downloadUrl={downloadUrl}
                locale={locale}
                result={result}
              />
            ) : (
              <EmptyState
                description={m["tools.pdfTextExtractor.noFileDescription"]()}
                icon={<Eye aria-hidden className="size-5" />}
                title={m["tools.pdfInfoViewer.noFileTitle"]()}
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
            <Alert.Title>{m["tools.pdfInfoViewer.errorTitle"]()}</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolArticle>
        <h2>{m["tools.exifViewer.article.whatTitle"]()}</h2>
        <p>{m["tools.pdfTextExtractor.article.what"]()}</p>
        <h2>{m["tools.exifViewer.article.useCasesTitle"]()}</h2>
        <ul>
          {[
            m["tools.pdfTextExtractor.article.useCases0"](),
            m["tools.pdfTextExtractor.article.useCases1"](),
            m["tools.pdfTextExtractor.article.useCases2"](),
            m["tools.pdfTextExtractor.article.useCases3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.exifViewer.article.privacyTitle"]()}</h2>
        <p>{m["tools.pdfTextExtractor.article.privacy"]()}</p>
        <h2>{m["tools.pdfInfoViewer.article.limitationsTitle"]()}</h2>
        <p>{m["tools.pdfTextExtractor.article.limitations"]()}</p>
      </ToolArticle>
    </div>
  );
}

function TextResults({
  downloadFileName,
  downloadUrl,
  locale,
  result,
}: {
  downloadFileName: string;
  downloadUrl: string;
  locale: string;
  result: TextResult;
}) {
  const hasText = Boolean(result.text.trim());
  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">
            {m["tools.pdfTextExtractor.documentResults"]()}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {m["tools.pdfTextExtractor.resultsDescription"]()}
          </p>
        </div>
        {hasText ? (
          <ToolPanelActionGroup className="sm:justify-end">
            <ToolCopyButton
              className="w-full"
              copiedLabel={m["common.actions.copied"]()}
              copyLabel={m["tools.pdfTextExtractor.copyText"]()}
              value={result.text}
            />
            {downloadUrl ? (
              <a
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                download={downloadFileName}
                href={downloadUrl}
              >
                <Download aria-hidden className="size-4" />
                {m["shared.pdfReading.ksuidDownload"]()}
              </a>
            ) : null}
          </ToolPanelActionGroup>
        ) : null}
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <Metric
          label={m["shared.pdfEditing.pages"]()}
          locale={locale}
          value={result.pageCount}
        />
        <Metric
          label={m["tools.pdfTextExtractor.textPages"]()}
          locale={locale}
          value={result.textPages}
        />
        <Metric
          label={m["tools.pdfTextExtractor.emptyTextPages"]()}
          locale={locale}
          value={result.emptyTextPages}
        />
        <Metric
          label={m["tools.pdfTextExtractor.likelyScannedPages"]()}
          locale={locale}
          value={result.likelyScannedPages}
        />
        <Metric
          label={m["shared.pdfEditing.readcharacters"]()}
          locale={locale}
          value={result.characterCount}
        />
        <Metric
          label={m["shared.pdfEditing.readwords"]()}
          locale={locale}
          value={result.wordCount}
        />
      </dl>

      {result.likelyScannedPages > 0 ? (
        <Alert status="warning">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.pdfTextExtractor.scannedWarningTitle"]()}
            </Alert.Title>
            <Alert.Description>
              {m["tools.pdfTextExtractor.scannedWarning"]()}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {hasText ? (
        <div className="grid gap-2">
          <Label htmlFor="pdf-text-extractor-output">
            {m["tools.pdfTextExtractor.textPreviewLabel"]()}
          </Label>
          <TextArea
            id="pdf-text-extractor-output"
            variant="secondary"
            className="min-h-88 resize-y font-mono text-sm whitespace-pre-wrap"
            readOnly
            value={result.text}
          />
        </div>
      ) : (
        <EmptyState
          description={m["tools.pdfTextExtractor.noTextDescription"]()}
          icon={<FileText aria-hidden className="size-5" />}
          title={m["tools.pdfTextExtractor.noTextTitle"]()}
          compact
        />
      )}
    </div>
  );
}

function Metric({
  label,
  locale,
  value,
}: {
  label: string;
  locale: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 min-h-7 text-lg font-medium wrap-break-word">
        {new Intl.NumberFormat(locale).format(value)}
      </dd>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid min-h-72 gap-5" role="status">
      <div className="grid gap-1">
        <h2 className="font-medium">
          {m["tools.pdfTextExtractor.extractingTitle"]()}
        </h2>
        <p className="text-sm text-muted">
          {m["tools.pdfTextExtractor.extractingDescription"]()}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          m["shared.pdfEditing.pages"](),
          m["tools.pdfTextExtractor.textPages"](),
          m["tools.pdfTextExtractor.emptyTextPages"](),
          m["tools.pdfTextExtractor.likelyScannedPages"](),
          m["shared.pdfEditing.readcharacters"](),
          m["shared.pdfEditing.readwords"](),
        ].map((label) => (
          <div key={label} className="grid gap-2 rounded-xl border p-3">
            <span className="text-sm text-muted">{label}</span>
            <Skeleton className="h-7 w-2/3 rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="min-h-52 rounded-xl" />
    </div>
  );
}

function EmptyState({
  compact = false,
  description,
  icon,
  title,
}: {
  compact?: boolean;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div
      className={`flex ${compact ? "min-h-56" : "min-h-72"} flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/30 p-6 text-center`}
    >
      <span className="grid size-11 place-items-center rounded-full bg-default text-muted">
        {icon}
      </span>
      <h2 className="font-medium">{title}</h2>
      <p className="max-w-md text-sm text-muted">{description}</p>
    </div>
  );
}

function isPdfFile(file: Pick<File, "name" | "type">) {
  return file.type === "application/pdf" || PDF_EXTENSION.test(file.name);
}

function readFile(
  file: File,
  signal: AbortSignal,
  target: MutableRefObject<FileReader | null>,
) {
  signal.throwIfAborted();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    target.current = reader;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (target.current === reader) target.current = null;
    };
    const abort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    reader.onload = () => {
      const value = reader.result;
      cleanup();
      if (value instanceof ArrayBuffer) resolve(value);
      else reject(new Error("Invalid FileReader result"));
    };
    reader.onerror = () => {
      const reason = reader.error ?? new Error("FileReader failed");
      cleanup();
      reject(reason);
    };
    reader.onabort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsArrayBuffer(file);
  });
}

function toErrorMessage(cause: unknown) {
  if (cause instanceof PdfEditingError && cause.code === "encrypted_pdf") {
    return m["tools.pdfTextExtractor.passwordError"]();
  }
  return m["tools.pdfTextExtractor.parseError"]();
}

function createTextDownloadFileName(fileName: string) {
  const safe = Array.from(fileName, (character) =>
    character.charCodeAt(0) < 32 ? "-" : character,
  ).join("");
  const base = safe
    .replace(/\.pdf$/iu, "")
    .replace(/[<>:"/\\|?*]+/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
  return base ? `${base}.txt` : "extracted-text.txt";
}

function formatBytes(bytes: number, locale: string) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const precision = value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
  }).format(value)} ${units[index]}`;
}

export default function PdfTextExtractorPage() {
  return (
    <ToolPage>
      <PdfTextExtractorPageContent />
    </ToolPage>
  );
}
