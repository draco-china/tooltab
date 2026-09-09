import { useObjectUrl } from "@/hooks/use-object-url";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Chip, Skeleton } from "@heroui/react";
import {
  BadgeCheck,
  Download,
  FileText,
  Lock,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { MAX_PDF_INPUT, PdfEditingError } from "@workspace/tools/pdf/core";
import { m } from "@/paraglide/messages.js";
import { downloadUrl } from "@/lib/download";
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import type { FinishingResult } from "@workspace/tools/pdf/finishing";
import { runFinishingWorker } from "../pdf-finishing/worker-client";

type SelectedPdf = Readonly<{ file: File; bytes: Uint8Array }>;

function RemovePdfOwnerPasswordPageContent() {
  const locale = getLocale();
  const [selected, setSelected] = useState<SelectedPdf | null>(null);
  const [result, setResult] = useState<FinishingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const reader = useRef<FileReader | null>(null);
  const controller = useRef<AbortController | null>(null);
  const resultBytes = result?.bytes ?? null;
  const resultBlob = useMemo(
    () =>
      resultBytes
        ? new Blob([new Uint8Array(resultBytes)], { type: "application/pdf" })
        : null,
    [resultBytes],
  );
  const resultUrl = useObjectUrl(resultBlob);

  useEffect(
    () => () => {
      revision.current++;
      reader.current?.abort();
      controller.current?.abort();
    },
    [],
  );

  function invalidate() {
    revision.current++;
    reader.current?.abort();
    controller.current?.abort();
    setResult(null);
    setError("");
    setBusy(false);
  }

  async function selectFile(file: File) {
    invalidate();
    setSelected(null);
    if (!isPdfFile(file)) {
      setError(m["tools.pdfInfoViewer.unsupportedFile"]());
      return;
    }
    if (!file.size) {
      setError(m["tools.removePdfOwnerPassword.emptyFileError"]());
      return;
    }
    if (file.size > MAX_PDF_INPUT) {
      setError(m["tools.removePdfOwnerPassword.inputTooLargeError"]());
      return;
    }
    const run = revision.current;
    setBusy(true);
    try {
      const bytes = await readFile(file, reader);
      if (run !== revision.current) return;
      if (!bytes.length) {
        setError(m["tools.removePdfOwnerPassword.emptyFileError"]());
        return;
      }
      setSelected({ file, bytes });
    } catch (cause) {
      if (run === revision.current && !isAbort(cause))
        setError(m["tools.removePdfOwnerPassword.genericError"]());
    } finally {
      if (run === revision.current) setBusy(false);
    }
  }

  async function processFile() {
    if (!selected) return;
    invalidate();
    const run = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const output = await runFinishingWorker(
        { kind: "unlock", bytes: selected.bytes },
        abort.signal,
      );
      if (run === revision.current) setResult(output);
    } catch (cause) {
      if (run === revision.current && !abort.signal.aborted)
        setError(errorMessage(cause));
    } finally {
      if (run === revision.current) setBusy(false);
    }
  }

  function clearFile() {
    invalidate();
    setSelected(null);
  }

  return (
    <div className="grid gap-6">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]"
        data-remove-pdf-panels
      >
        <ToolPanelCard className="xl:sticky xl:top-6">
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.pdfPageNumberAdder.uploadTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.removePdfOwnerPassword.uploadDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div
              className={
                selected
                  ? undefined
                  : "[&_[data-source-dropzone]>button]:min-h-72"
              }
            >
              <ToolFilePicker
                label={
                  selected
                    ? m["tools.pdfInfoViewer.changeFile"]()
                    : m["tools.pdfInfoViewer.dragDropOrClick"]()
                }
                description={m["tools.pdfInfoViewer.supportedFormats"]()}
                accept={[".pdf", "application/pdf"]}
                fileName={selected?.file.name}
                clearLabel={m["shared.aesTools.clearfile"]()}
                isDisabled={busy}
                inputTestId="remove-owner-password-input"
                onSelect={(file) => void selectFile(file)}
                onClear={clearFile}
              />
            </div>

            {selected ? (
              <>
                <div className="grid gap-3 rounded-xl border border-separator bg-default/20 p-4 text-sm">
                  <div className="grid gap-1">
                    <span className="font-medium">
                      {m["common.datauriFilename"]()}
                    </span>
                    <span className="break-all text-muted">
                      {selected.file.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-separator pt-3">
                    <span className="font-medium">
                      {m["tools.audioRecorder.size"]()}
                    </span>
                    <span className="text-muted">
                      {formatFileSize(selected.file.size, locale)}
                    </span>
                  </div>
                </div>
                <div className="grid gap-1">
                  <h3 className="font-medium">
                    {m["tools.pdfInfoViewer.selectedPdf"]()}
                  </h3>
                  <p className="text-sm text-muted">
                    {m["tools.removePdfOwnerPassword.actionDescription"]()}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {m["tools.removePdfOwnerPassword.openPasswordNote"]()}
                </p>
                <Button
                  fullWidth
                  isDisabled={busy}
                  onPress={() => void processFile()}
                >
                  <Download aria-hidden className="size-4" />
                  {m["tools.removePdfOwnerPassword.actionLabel"]()}
                </Button>
              </>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ResultCard
          selected={selected}
          result={result}
          resultUrl={resultUrl}
          busy={busy}
          onCancel={invalidate}
        />
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.removePdfOwnerPassword.errorTitle"]()}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolArticle>
        <p>{m["tools.removePdfOwnerPassword.articleLead"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.removePdfOwnerPassword.articleWhenBody"]()}</p>
        <h2>{m["shared.asciiArt.article.howTitle"]()}</h2>
        <p>
          {m["tools.removePdfOwnerPassword.articleHowBodyBefore"]()}
          <code>{m["tools.removePdfOwnerPassword.articleHowCode"]()}</code>
          {m["tools.removePdfOwnerPassword.articleHowBodyAfter"]()}
        </p>
        <h2>{m["tools.gifToAnimatedWebpConverter.article.privacyTitle"]()}</h2>
        <p>{m["tools.removePdfOwnerPassword.articlePrivacyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function ResultCard({
  selected,
  result,
  resultUrl,
  busy,
  onCancel,
}: Readonly<{
  selected: SelectedPdf | null;
  result: FinishingResult | null;
  resultUrl: string;
  busy: boolean;
  onCancel: () => void;
}>) {
  const locale = getLocale();
  const filename = selected
    ? createOutputFileName(selected.file.name)
    : "unlocked.pdf";
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.macIntegrity.result"]()}</Card.Title>
        <Card.Description>
          {m["tools.removePdfOwnerPassword.resultDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {busy && selected ? (
          <div
            className="grid min-h-72 content-center gap-4"
            role="status"
            aria-label={m["tools.removePdfOwnerPassword.processingLabel"]()}
          >
            <Skeleton className="mx-auto size-12 rounded-full" />
            <Skeleton className="mx-auto h-5 w-40 rounded-lg" />
            <Skeleton className="mx-auto h-4 w-72 max-w-full rounded-lg" />
            <Button
              className="mx-auto"
              size="sm"
              variant="outline"
              onPress={onCancel}
            >
              {m["common.actions.cancel"]()}
            </Button>
          </div>
        ) : result ? (
          <div className="grid min-h-72 place-items-center rounded-xl border border-separator bg-default/20 p-6 text-center">
            <div className="grid max-w-lg justify-items-center gap-4">
              <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
                <BadgeCheck aria-hidden className="size-6" />
              </span>
              <div className="grid gap-1">
                <h3 className="font-medium">
                  {m["tools.imageToPdfConverter.resultReadyTitle"]()}
                </h3>
                <p className="text-sm text-muted">
                  {result.wasEncrypted === false
                    ? m[
                        "tools.removePdfOwnerPassword.alreadyUnrestrictedDescription"
                      ]()
                    : m["tools.removePdfOwnerPassword.successDescription"]()}
                </p>
              </div>
              <ToolPanelActionGroup className="justify-center">
                <Chip size="sm" variant="secondary">
                  {m["tools.highwayhashHashTextOrFile.outputSizeLabel"]()}:{" "}
                  {formatFileSize(result.bytes.length, locale)}
                </Chip>
                <Chip
                  size="sm"
                  variant="tertiary"
                  className="max-w-full break-all"
                >
                  {filename}
                </Chip>
              </ToolPanelActionGroup>
            </div>
          </div>
        ) : (
          <EmptyResult selected={selected} />
        )}
      </ToolPanelCardContent>
      {result && resultUrl ? (
        <ToolPanelCardFooter className="flex justify-end">
          <Button onPress={() => downloadUrl(resultUrl, filename)}>
            <Download aria-hidden className="size-4" />
            {m["shared.pdfEditing.download"]()}
          </Button>
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function EmptyResult({ selected }: Readonly<{ selected: SelectedPdf | null }>) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-default text-muted">
          {selected ? (
            <Lock aria-hidden className="size-5" />
          ) : (
            <FileText aria-hidden className="size-5" />
          )}
        </span>
        <div className="grid gap-1">
          <h3 className="font-medium">
            {selected
              ? m["tools.removePdfOwnerPassword.readyTitle"]()
              : m["tools.pdfInfoViewer.noFileTitle"]()}
          </h3>
          <p className="text-sm text-muted">
            {selected
              ? m["tools.removePdfOwnerPassword.readyDescription"]()
              : m["tools.removePdfOwnerPassword.noFileDescription"]()}
          </p>
        </div>
      </div>
    </div>
  );
}

function readFile(file: File, ref: { current: FileReader | null }) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const active = new FileReader();
    ref.current = active;
    active.onload = () =>
      active.result instanceof ArrayBuffer
        ? resolve(new Uint8Array(active.result))
        : reject(new Error("read_failed"));
    active.onerror = () => reject(active.error ?? new Error("read_failed"));
    active.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    active.readAsArrayBuffer(file);
  });
}

function isAbort(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function createOutputFileName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "unlocked.pdf";
  return /\.pdf$/i.test(trimmed)
    ? trimmed.replace(/\.pdf$/i, "-unlocked.pdf")
    : `${trimmed}-unlocked.pdf`;
}

function errorMessage(cause: unknown) {
  const code = cause instanceof PdfEditingError ? cause.code : "";
  if (code === "unsupported")
    return m["tools.removePdfOwnerPassword.workerUnsupportedError"]();
  if (code === "too_large")
    return m["tools.removePdfOwnerPassword.inputTooLargeError"]();
  if (code === "timeout")
    return m["tools.removePdfOwnerPassword.timeoutError"]();
  if (["encrypted_pdf", "invalid_pdf", "unsupported_structure"].includes(code))
    return m["tools.removePdfOwnerPassword.qpdfFailedError"]();
  return m["tools.removePdfOwnerPassword.genericError"]();
}

export default function RemovePdfOwnerPasswordPage() {
  return (
    <ToolPage>
      <RemovePdfOwnerPasswordPageContent />
    </ToolPage>
  );
}
