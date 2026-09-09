import { ShaHashError } from "@workspace/tools/hash/sha-input";
import {
  Alert,
  Card,
  Input,
  Label,
  Skeleton,
  Spinner,
  TextArea,
} from "@heroui/react";
import { FileText, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import type { ShaWorkerDigest } from "./worker-client";

const DEFAULT_TEXT = "Hello, browser-native world!";

type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: ShaWorkerDigest }
  | { status: "error"; message: string };

export function ShakeHashPage({
  variant,
  defaultOutputBits,
  legacyStorageKey,
  fileInputTestId,
  runWorker,
}: {
  variant: 128 | 256;
  defaultOutputBits: number;
  legacyStorageKey: string;
  fileInputTestId: string;
  runWorker: (
    source: string | File,
    outputBits: number,
    signal: AbortSignal,
  ) => Promise<ShaWorkerDigest>;
}) {
  const locale = getLocale();
  const id = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [outputBits, setOutputBits] = useState(String(defaultOutputBits));
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });
  const debouncedText = useDebouncedValue(text);
  const parsedBits = Number(outputBits);
  const outputIsValid =
    Number.isInteger(parsedBits) &&
    parsedBits >= 8 &&
    parsedBits <= 65536 &&
    parsedBits % 8 === 0;

  useEffect(() => {
    safeLocalStorage.removeItem(legacyStorageKey);
  }, [legacyStorageKey]);
  useEffect(() => {
    if (!file && text !== debouncedText) {
      setState({ status: "loading" });
      return;
    }
    if (!file && debouncedText.length === 0) {
      setState({ status: "idle" });
      return;
    }
    if (!outputIsValid) {
      setState({
        status: "error",
        message: m["tools.shake128HashTextOrFile.outputLengthInvalid"](),
      });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void runWorker(file ?? debouncedText, parsedBits, controller.signal)
      .then((digest) => {
        if (!controller.signal.aborted) setState({ status: "ready", digest });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof ShaHashError && error.code === "too-large"
            ? m["tools.sha1HashTextOrFile.tooLargeError"]()
            : file
              ? m["tools.ripemd128HashTextOrFile.fileError"]()
              : m["tools.ripemd128HashTextOrFile.textError"]();
        setState({ status: "error", message });
      });
    return () => controller.abort();
  }, [debouncedText, file, outputIsValid, parsedBits, runWorker, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <>
      <div className="grid gap-6" data-tool-panels data-shake-hash-page>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2 sm:max-w-56">
              <Label htmlFor={`${id}-bits`}>
                {m["shared.blakeHash.blake2bOutputLengthLabel"]()}
              </Label>
              <Input
                id={`${id}-bits`}
                value={outputBits}
                inputMode="numeric"
                placeholder={
                  variant === 128
                    ? m[
                        "tools.shake128HashTextOrFile.outputLengthPlaceholder"
                      ]()
                    : m[
                        "tools.shake256HashTextOrFile.outputLengthPlaceholder"
                      ]()
                }
                aria-invalid={!outputIsValid}
                onChange={(event) => setOutputBits(event.currentTarget.value)}
                className="font-mono"
              />
              {!outputIsValid ? (
                <p className="text-sm text-danger">
                  {m["tools.shake128HashTextOrFile.outputLengthInvalid"]()}
                </p>
              ) : null}
            </div>
            {file ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-5 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium break-all">{file.name}</p>
                  <p className="text-sm text-muted">
                    {formatFileSize(file.size, locale)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor={`${id}-text`}>
                  {m["common.adler32plaintextlabel"]()}
                </Label>
                <TextArea
                  id={`${id}-text`}
                  aria-label={m["common.adler32plaintextlabel"]()}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                />
              </div>
            )}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="block">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={file ? sourceDescription : undefined}
              clearLabel={m["common.adler32plaintextlabel"]()}
              inputTestId={fileInputTestId}
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
          <ToolPanelCardContent
            className="py-4"
            aria-busy={state.status === "loading"}
          >
            <DigestSection state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <h2>
          {variant === 128
            ? m["tools.shake128HashTextOrFile.article.title"]()
            : m["tools.shake256HashTextOrFile.article.title"]()}
        </h2>
        {[
          variant === 128
            ? m["tools.shake128HashTextOrFile.article.paragraphs0"]()
            : m["tools.shake256HashTextOrFile.article.paragraphs0"](),
          m["tools.shake128HashTextOrFile.article.paragraphs1"](),
          m["tools.shake128HashTextOrFile.article.paragraphs2"](),
        ].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </ToolArticle>
    </>
  );
}

function DigestSection({ state }: { state: DigestState }) {
  if (state.status === "idle")
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["common.adler32plaintextdescription"]()}
      </div>
    );
  if (state.status === "error")
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
            className="grid min-w-0 gap-3 rounded-xl border border-separator bg-default/20 p-4"
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

function formatFileSize(size: number, locale: string) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${format(size / 1024)} KB`;
  return `${format(size / (1024 * 1024))} MB`;
}
