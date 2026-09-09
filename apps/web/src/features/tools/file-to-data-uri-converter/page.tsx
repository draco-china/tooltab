import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, Skeleton } from "@heroui/react";
import { FileText, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { DataUriError } from "@workspace/tools/encoding/data-uri";
import { convertDataUri } from "../data-uri/worker-client";

const MAX_FILE_SIZE = 32 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 break-all">{value}</p>
    </div>
  );
}

function InputCard({
  file,
  error,
  onSelect,
  onClear,
  onMultipleFiles,
}: {
  file: File | null;
  error: string;
  onSelect: (file: File) => void;
  onClear: () => void;
  onMultipleFiles: () => void;
}) {
  return (
    <ToolPanelCard className="min-w-0">
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.fileToDataUriConverter.inputTitle"]()}
        </Card.Title>
        <Card.Description>
          {m["tools.fileToDataUriConverter.inputDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <div
          onDropCapture={(event) => {
            if (event.dataTransfer.files.length <= 1) return;
            event.preventDefault();
            event.stopPropagation();
            onMultipleFiles();
          }}
        >
          <ToolFilePicker
            label={m["shared.aesTools.decryptfileplaintextlabel"]()}
            description={m["tools.fileToDataUriConverter.dragOrClick"]()}
            fileName={file?.name}
            clearLabel={m["shared.aesTools.decryptclearfilelabel"]()}
            onSelect={onSelect}
            onClear={onClear}
          />
        </div>

        {file ? (
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" variant="secondary">
              {formatBytes(file.size)}
            </Chip>
            <Chip size="sm" variant="tertiary">
              {file.type || m["tools.fileToDataUriConverter.unknownType"]()}
            </Chip>
          </div>
        ) : null}

        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["shared.baseEncoding.base16FileReadFailedTitle"]()}
              </Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultCard({
  file,
  dataUri,
  mimeType,
  busy,
}: {
  file: File | null;
  dataUri: string;
  mimeType: string;
  busy: boolean;
}) {
  const description =
    file && dataUri
      ? `${file.name} · ${formatBytes(file.size)} · ${mimeType || m["tools.fileToDataUriConverter.unknownType"]()}`
      : m["tools.fileToDataUriConverter.resultDescription"]();

  return (
    <ToolPanelCard className="min-w-0">
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <Card.Title>{m["tools.fileToDataUriConverter.dataUri"]()}</Card.Title>
        <Card.Description>{description}</Card.Description>
        {file && dataUri && !busy ? (
          <ToolCopyButton
            value={dataUri}
            copyLabel={m["common.actions.copy"]()}
            copiedLabel={m["common.actions.copied"]()}
            className="sm:col-start-2 sm:row-span-2 sm:row-start-1"
          />
        ) : null}
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4" aria-busy={busy}>
        {busy ? (
          <div
            className="grid min-h-64 content-center gap-4"
            role="status"
            aria-label={m["tools.fileToDataUriConverter.dataUri"]()}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : file && dataUri ? (
          <>
            <section className="grid min-w-0 gap-3 sm:grid-cols-3">
              <MetricTile
                label={m["shared.aesTools.decryptfileplaintextlabel"]()}
                value={file.name}
              />
              <MetricTile
                label={m["tools.audioRecorder.size"]()}
                value={formatBytes(file.size)}
              />
              <MetricTile
                label={m["tools.dataUriToFileConverter.mimeTypeLabel"]()}
                value={
                  mimeType || m["tools.fileToDataUriConverter.unknownType"]()
                }
              />
            </section>
            <section
              aria-label={m["tools.fileToDataUriConverter.dataUri"]()}
              className="h-80 min-h-0 max-w-full min-w-0 overflow-auto rounded-xl border border-border bg-default/20 p-4 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-foreground"
            >
              <pre>{dataUri}</pre>
            </section>
          </>
        ) : (
          <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="rounded-full bg-default p-3">
              <FileText aria-hidden className="size-5 text-muted" />
            </span>
            <div className="grid gap-1">
              <p className="text-sm font-medium">
                {m["tools.fileToDataUriConverter.dataUri"]()}
              </p>
              <p className="text-sm text-muted">
                {m["tools.fileToDataUriConverter.dataUriPlaceholder"]()}
              </p>
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Article() {
  return (
    <ToolArticle>
      <h2>{m["tools.fileToDataUriConverter.articleWhatTitle"]()}</h2>
      <p>
        {m["tools.fileToDataUriConverter.articleWhatBeforeFormat"]()}
        <code>data:[mime][;charset][;base64],data</code>
        {m["tools.dnsLookup.article.howAfterUrl"]()}
      </p>
      <p>
        <strong>{m["common.adler32articlecommonuses"]()}</strong>
      </p>
      <ul>
        {[
          m["tools.fileToDataUriConverter.articleCommonUses0"](),
          m["tools.fileToDataUriConverter.articleCommonUses1"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        <strong>{m["shared.baseEncoding.base16ArticleNotesTitle"]()}</strong>
      </p>
      <ul>
        {[
          m["tools.fileToDataUriConverter.articleNotes0"](),
          m["tools.fileToDataUriConverter.articleNotes1"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>{m["shared.jsonQuery.example"]()}</h3>
      <pre>
        <code>data:image/svg+xml;base64,PHN2ZyB4bWxucz0i...</code>
      </pre>
      <p>{m["tools.fileToDataUriConverter.articleExampleAfter"]()}</p>
      <h3>{m["tools.fileToDataUriConverter.articleWhenTitle"]()}</h3>
      <ul>
        {[
          m["tools.fileToDataUriConverter.articleWhenItems0"](),
          m["tools.fileToDataUriConverter.articleWhenItems1"](),
          m["tools.fileToDataUriConverter.articleWhenItems2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>{m["tools.fileToDataUriConverter.articleLimitsTitle"]()}</h3>
      <ul>
        {[
          m["tools.fileToDataUriConverter.articleLimitsItems0"](),
          m["tools.fileToDataUriConverter.articleLimitsItems1"](),
          m["tools.fileToDataUriConverter.articleLimitsItems2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function FileToDataUriContent() {
  const [file, setFile] = useState<File | null>(null);
  const [dataUri, setDataUri] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);

  function clear() {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    setFile(null);
    setDataUri("");
    setMimeType("");
    setError("");
    setBusy(false);
  }

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  async function select(nextFile: File) {
    clear();
    setFile(nextFile);
    if (nextFile.size > MAX_FILE_SIZE) {
      setError(m["tools.fileToDataUriConverter.tooLarge"]());
      return;
    }

    const active = new AbortController();
    const activeRevision = revision.current;
    controller.current = active;
    setBusy(true);
    try {
      const result = await convertDataUri(
        { kind: "encode", file: nextFile },
        active.signal,
      );
      if (result.kind !== "encode") throw new DataUriError("read_failed");
      const nextDataUri = await result.blob.text();
      if (active.signal.aborted || activeRevision !== revision.current) return;
      setDataUri(nextDataUri);
      setMimeType(result.mimeType);
    } catch (cause) {
      if (!active.signal.aborted && activeRevision === revision.current) {
        setError(
          cause instanceof DataUriError && cause.code === "too_large"
            ? m["tools.fileToDataUriConverter.tooLarge"]()
            : m["shared.baseEncoding.base16FileReadFailedTitle"](),
        );
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <InputCard
          file={file}
          error={error}
          onSelect={(nextFile) => void select(nextFile)}
          onClear={clear}
          onMultipleFiles={() => {
            clear();
            setError(m["tools.fileToDataUriConverter.onlyOneFile"]());
          }}
        />
        <ResultCard
          file={file}
          dataUri={dataUri}
          mimeType={mimeType}
          busy={busy}
        />
      </div>
      <Article />
    </div>
  );
}

export default function FileToDataUri() {
  return (
    <ToolPage>
      <FileToDataUriContent />
    </ToolPage>
  );
}
