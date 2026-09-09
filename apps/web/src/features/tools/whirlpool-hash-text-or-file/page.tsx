import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Label, Skeleton, Spinner, TextArea } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { blobChunks } from "@workspace/tools/hash/browser";
import { textBytes } from "@workspace/tools/hash/input";
import type { HashResult } from "./worker-client";
import { runWhirlpoolHash } from "./worker-client";

const DEFAULT_TEXT = "Hello, browser-native world!";
const DEBOUNCE_MS = 250;

type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: HashResult }
  | { status: "error"; message: string };

async function* zeroingChunks(blob: Blob, signal: AbortSignal) {
  for await (const chunk of blobChunks(blob, signal)) {
    try {
      yield chunk;
    } finally {
      chunk.fill(0);
    }
  }
}

function formatFileSize(size: number, locale: string) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${format(size / 1024)} KB`;
  return `${format(size / (1024 * 1024))} MB`;
}

function WhirlpoolHashTextOrFilePageContent() {
  const locale = getLocale();
  const id = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    if (!file && !text.length) {
      setState({ status: "idle" });
      return () => controller.abort();
    }

    setState({ status: "loading" });
    const timer = window.setTimeout(() => {
      void hashSource(file, text, controller.signal)
        .then((digest) => {
          if (!controller.signal.aborted) setState({ status: "ready", digest });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            message: file
              ? m["tools.highwayhashHashTextOrFile.fileHashErrorLabel"]()
              : m["tools.highwayhashHashTextOrFile.textHashErrorLabel"](),
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [file, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <div className="grid gap-6" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
          <Card.Description>{sourceDescription}</Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {file ? (
            <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
              <p className="text-sm font-medium break-all">{file.name}</p>
              <p className="text-sm text-muted">
                {formatFileSize(file.size, locale)}
              </p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`${id}-text`}>
                {m["common.adler32plaintextlabel"]()}
              </Label>
              <TextArea
                id={`${id}-text`}
                aria-label={m["common.adler32plaintextlabel"]()}
                spellCheck={false}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="min-h-64 flex-1 resize-y font-mono text-sm"
              />
            </div>
          )}
          <ToolFilePicker
            label={m["common.adler32importfromfilelabel"]()}
            fileName={file ? sourceDescription : undefined}
            clearLabel={m["common.adler32plaintextlabel"]()}
            onSelect={setFile}
            onClear={file ? () => setFile(null) : undefined}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="grid border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
            <Card.Description>
              {file
                ? sourceDescription
                : m["common.adler32hashresultdescription"]()}
            </Card.Description>
          </div>
          {state.status === "loading" ? <Spinner size="sm" /> : null}
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <DigestSection state={state} />
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

export default function WhirlpoolHashTextOrFilePage() {
  return (
    <ToolPage>
      <WhirlpoolHashTextOrFilePageContent />
    </ToolPage>
  );
}

async function hashSource(
  file: File | null,
  text: string,
  signal: AbortSignal,
) {
  let source: Blob;
  if (file) {
    source = file;
  } else {
    const textBuffer = Uint8Array.from(textBytes(text));
    try {
      source = new Blob([textBuffer.buffer]);
    } finally {
      textBuffer.fill(0);
    }
  }
  return runWhirlpoolHash(zeroingChunks(source, signal), signal);
}

function DigestSection({ state }: Readonly<{ state: DigestState }>) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["common.adler32plaintextdescription"]()}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
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
            className="grid gap-3 rounded-xl border border-separator bg-default/20 p-4"
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
            {state.status === "loading" ? (
              <Skeleton className="h-5 w-full rounded-lg" />
            ) : (
              <code className="block text-xs leading-6 break-all sm:text-sm">
                {value}
              </code>
            )}
          </section>
        );
      })}
    </div>
  );
}
