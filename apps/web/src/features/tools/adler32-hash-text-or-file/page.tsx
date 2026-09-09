import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Label, Spinner, TextArea } from "@heroui/react";
import { FileText, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import { getLocale } from "@/paraglide/runtime.js";
import { Adler32Error, blobChunks } from "./logic";
import type { Adler32Result } from "@workspace/tools/checksum/adler32";
import { runAdler32Worker } from "./worker-client";

type Adler32DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Adler32Result }
  | { status: "error"; message: string };

function Adler32ToolContent() {
  const fileErrorDescription =
    m["tools.adler32HashTextOrFile.fileErrorDescription"]();
  const textErrorDescription =
    m["tools.adler32HashTextOrFile.textErrorDescription"]();
  const tooLargeDescription =
    m["tools.adler32HashTextOrFile.tooLargeDescription"]();
  const plainTextId = useId();
  const [plainText, setPlainText] = useState(
    "Hello, browser-native Adler-32 world!",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [digestState, setDigestState] = useState<Adler32DigestState>({
    status: "loading",
  });
  const deferredPlainText = useDeferredValue(plainText);

  useEffect(() => {
    safeLocalStorage.removeItem("tools:adler32-hash-text-or-file:text");
  }, []);

  useEffect(() => {
    const source = selectedFile
      ? selectedFile
      : deferredPlainText.length > 0
        ? new Blob([deferredPlainText])
        : null;
    if (!source) {
      setDigestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setDigestState({ status: "loading" });
    void runAdler32Worker(
      blobChunks(source, controller.signal),
      controller.signal,
    )
      .then((digest) => {
        if (!controller.signal.aborted) {
          setDigestState({ status: "ready", digest });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDigestState({
            status: "error",
            message:
              error instanceof Adler32Error && error.code === "too_large"
                ? tooLargeDescription
                : selectedFile
                  ? fileErrorDescription
                  : textErrorDescription,
          });
        }
      });
    return () => controller.abort();
  }, [
    fileErrorDescription,
    textErrorDescription,
    tooLargeDescription,
    deferredPlainText,
    selectedFile,
  ]);

  const sourceDescription = selectedFile
    ? `${selectedFile.name} • ${formatFileSize(selectedFile.size, getLocale())}`
    : m["common.adler32plaintextdescription"]();

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent>
            {selectedFile ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-5 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm text-muted">
                    {formatFileSize(selectedFile.size, getLocale())}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor={plainTextId}>
                  {m["common.adler32plaintextlabel"]()}
                </Label>
                <TextArea
                  id={plainTextId}
                  aria-label={m["common.adler32plaintextlabel"]()}
                  spellCheck={false}
                  value={plainText}
                  onChange={(event) => setPlainText(event.target.value)}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                />
              </div>
            )}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="block">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={selectedFile?.name}
              clearLabel={m["common.adler32plaintextlabel"]()}
              onSelect={setSelectedFile}
              onClear={selectedFile ? () => setSelectedFile(null) : undefined}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["shared.hashTextOrFile.sharesult"]()}</Card.Title>
              <Card.Description>
                {selectedFile
                  ? sourceDescription
                  : m["tools.adler32HashTextOrFile.hashResultDescription"]()}
              </Card.Description>
            </div>
            {digestState.status === "loading" ? <Spinner size="sm" /> : null}
          </Card.Header>
          <ToolPanelCardContent>
            <Adler32DigestSection state={digestState} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <h2>{m["tools.adler32HashTextOrFile.articletitle"]()}</h2>
        <p>{m["tools.adler32HashTextOrFile.articleSummary"]()}</p>
        <p>
          <strong>{m["tools.adler32HashTextOrFile.articlekeypoints"]()}</strong>
        </p>
        <ul>
          <li>
            <strong>
              {m["tools.adler32HashTextOrFile.articlefasttitle"]()}
            </strong>{" "}
            {m["tools.adler32HashTextOrFile.articlefastbody"]()}
          </li>
          <li>
            <strong>
              {m["tools.adler32HashTextOrFile.articleintegritytitle"]()}
            </strong>{" "}
            {m["tools.adler32HashTextOrFile.articleIntegrityBody"]()}
          </li>
          <li>
            <strong>
              {m["tools.adler32HashTextOrFile.articlesecuritytitle"]()}
            </strong>{" "}
            {m["tools.adler32HashTextOrFile.articleSecurityBody"]()}
          </li>
        </ul>
        <p>
          <strong>{m["common.adler32articlecommonuses"]()}</strong>
        </p>
        <ul>
          <li>{m["tools.adler32HashTextOrFile.articlefiletransfer"]()}</li>
          <li>{m["tools.adler32HashTextOrFile.articleArchive"]()}</li>
          <li>{m["tools.adler32HashTextOrFile.articlelightweight"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

function Adler32DigestSection({ state }: { state: Adler32DigestState }) {
  if (state.status === "idle") {
    return (
      <Empty className="min-h-64 border border-border bg-default/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText aria-hidden className="size-4" />
          </EmptyMedia>
          <EmptyDescription>
            {m["tools.adler32HashTextOrFile.emptyResultDescription"]()}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section className="grid gap-4">
      {state.status === "error" ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {state.status === "loading" || state.status === "ready" ? (
        <div className="grid gap-3">
          {(
            [
              ["hex", m["common.adler32hexlabel"]()],
              ["base64", m["common.adler32base64label"]()],
              ["decimal", m["common.adler32decimallabel"]()],
              ["binary", m["common.adler32binarylabel"]()],
            ] as const
          ).map(([format, label]) => {
            const value = state.status === "ready" ? state.digest[format] : "";
            return (
              <section
                key={format}
                className={`grid gap-3 rounded-xl border border-border bg-default/20 p-4 ${
                  state.status === "loading" ? "opacity-75" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-sm font-medium">{label}</h3>
                  <ToolCopyButton
                    value={value}
                    copyLabel={m["common.adler32copyresultlabel"]()}
                    copiedLabel={m["common.actions.copied"]()}
                    disabled={state.status === "loading"}
                  />
                </div>
                <code className="block text-xs leading-6 break-all sm:text-sm">
                  {value}
                </code>
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function formatFileSize(size: number, locale: string) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${formatNumber(size / 1024, locale)} KB`;
  return `${formatNumber(size / (1024 * 1024), locale)} MB`;
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function Adler32Tool() {
  return (
    <ToolPage instructions={m["tools.adler32HashTextOrFile.usage"]()}>
      <Adler32ToolContent />
    </ToolPage>
  );
}
