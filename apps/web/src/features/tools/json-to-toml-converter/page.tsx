import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Skeleton } from "@heroui/react";
import { Download, TriangleAlert } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import { m } from "@/paraglide/messages.js";
import {
  MAX_STRUCTURED_INPUT,
  StructuredError,
} from "@workspace/tools/encoding/structured";
import { runStructuredWorker } from "../structured-formats/worker-client";

type ConversionState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; output: string }
  | { state: "error"; error: StructuredError };

const DEFAULT_JSON = `{
  "title": "TOML Example",
  "owner": {
    "name": "Tom Preston-Werner"
  },
  "database": {
    "ports": [8001, 8001, 8002],
    "enabled": true
  }
}`;

function JsonToTomlContent() {
  const errorId = useId();
  const controllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const revisionRef = useRef(0);
  const downloadUrlRef = useRef("");
  const [input, setInput] = useState(DEFAULT_JSON);
  const [conversionVersion, setConversionVersion] = useState(0);
  const [conversion, setConversion] = useState<ConversionState>({
    state: "loading",
  });
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredInput = useDeferredValue(input);
  const isPending = deferredInput !== input || conversion.state === "loading";

  function invalidate() {
    revisionRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    releaseReader(readerRef, true);
    revokeUrl(downloadUrlRef);
    setDownloadUrl("");
  }

  useEffect(
    () => () => {
      revisionRef.current++;
      controllerRef.current?.abort();
      controllerRef.current = null;
      releaseReader(readerRef, true);
      revokeUrl(downloadUrlRef);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: a newly imported file must rerun the Worker even when its text matches the current input
  useEffect(() => {
    if (!deferredInput.trim()) {
      setConversion({ state: "idle" });
      return;
    }

    const revision = ++revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setConversion({ state: "loading" });
    void (async () =>
      runStructuredWorker(
        { input: deferredInput, from: "json", to: "toml" },
        controller.signal,
      ))()
      .then((result) => {
        if (
          revision === revisionRef.current &&
          controllerRef.current === controller
        ) {
          setConversion({ state: "ready", output: result.output });
        }
      })
      .catch((error) => {
        if (
          revision === revisionRef.current &&
          controllerRef.current === controller &&
          !controller.signal.aborted
        ) {
          setConversion({
            state: "error",
            error:
              error instanceof StructuredError
                ? error
                : new StructuredError("invalid_input"),
          });
        }
      })
      .finally(() => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [conversionVersion, deferredInput]);

  useEffect(() => {
    revokeUrl(downloadUrlRef);
    if (conversion.state !== "ready") {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([conversion.output], {
        type: "application/toml;charset=utf-8",
      }),
    );
    downloadUrlRef.current = url;
    setDownloadUrl(url);
    return () => {
      if (downloadUrlRef.current === url) revokeUrl(downloadUrlRef);
    };
  }, [conversion]);

  function changeInput(value: string) {
    invalidate();
    setInput(value);
    setConversion(value.trim() ? { state: "loading" } : { state: "idle" });
  }

  function importFile(file: File) {
    invalidate();
    if (file.size > MAX_STRUCTURED_INPUT) {
      setConversion({
        state: "error",
        error: new StructuredError("too_large"),
      });
      return;
    }

    const revision = revisionRef.current;
    try {
      const reader = new FileReader();
      readerRef.current = reader;
      setConversion({ state: "loading" });
      reader.onload = () => {
        const result = reader.result;
        releaseReader(readerRef, false);
        if (
          revision !== revisionRef.current ||
          !(result instanceof ArrayBuffer)
        )
          return;
        try {
          const value = new TextDecoder("utf-8", { fatal: true }).decode(
            result,
          );
          startTransition(() => {
            setInput(value);
            setConversionVersion((current) => current + 1);
          });
        } catch {
          setConversion({
            state: "error",
            error: new StructuredError("read_failed"),
          });
        }
      };
      reader.onerror = () => {
        releaseReader(readerRef, false);
        if (revision === revisionRef.current) {
          setConversion({
            state: "error",
            error: new StructuredError("read_failed"),
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      releaseReader(readerRef, false);
      if (revision === revisionRef.current) {
        setConversion({
          state: "error",
          error: new StructuredError("read_failed"),
        });
      }
    }
  }

  function download() {
    if (!downloadUrl || conversion.state !== "ready") return;
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "converted.toml";
    anchor.click();
  }

  return (
    <div className="grid gap-8">
      <div className="grid items-stretch gap-6 xl:grid-cols-2" data-tool-panels>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="relative">
            <CodeEditor
              embedded
              title={m["tools.csvToJsonConverter.jsonLabel"]()}
              description={m["tools.jsonFormatter.rawJsonDescription"]()}
              aria-label={m["tools.csvToJsonConverter.jsonLabel"]()}
              aria-describedby={
                conversion.state === "error" ? errorId : undefined
              }
              aria-invalid={conversion.state === "error"}
              language="json"
              modelPath="tooltab://structured/json-to-toml-converter.json"
              value={input}
              height={320}
              onChange={changeInput}
            />
            {!input ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
              >
                {m["tools.jmespathTester.jsonPlaceholder"]()}
              </span>
            ) : null}
          </div>
          <div className="border-t border-separator p-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[".json", ".txt", "application/json", "text/plain"]}
              isDisabled={isPending}
              onSelect={importFile}
            />
          </div>
        </div>

        <div className="min-w-0" aria-busy={isPending}>
          {isPending ? (
            <OutputSkeleton
              label={m["tools.jsonToTomlConverter.tomlLabel"]()}
            />
          ) : conversion.state === "error" ? (
            <ErrorOutput error={conversion.error} id={errorId} />
          ) : conversion.state === "ready" ? (
            <>
              <CodeBlock
                code={conversion.output}
                title={m["tools.jsonToTomlConverter.tomlLabel"]()}
                description={m["tools.jsonToTomlConverter.tomlDescription"]()}
                language="toml"
                copyLabel={m["tools.jsonToTomlConverter.copyTomlLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                maxHeightClassName="min-h-80 max-h-[32rem]"
                previewCode={conversion.output.slice(0, 100_000)}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    isDisabled={!downloadUrl}
                    onPress={download}
                  >
                    <Download aria-hidden className="size-4" />
                    {m["tools.jsonToTomlConverter.downloadTomlLabel"]()}
                  </Button>
                }
              />
              {conversion.output.length > 100_000 ? (
                <p className="mt-3 text-sm text-muted">
                  {m["tools.jsonToTomlConverter.previewTruncated"]()}
                </p>
              ) : null}
            </>
          ) : (
            <EmptyOutput />
          )}
        </div>
      </div>

      <JsonToTomlArticle />
    </div>
  );
}

function EmptyOutput() {
  return (
    <section
      aria-label={m["tools.jsonToTomlConverter.tomlLabel"]()}
      className="flex min-h-80 flex-1 items-center p-6"
    >
      <p className="text-sm leading-6 text-muted">
        {m["tools.jsonToTomlConverter.tomlEmptyDescription"]()}
      </p>
    </section>
  );
}

function ErrorOutput({ error, id }: { error: StructuredError; id: string }) {
  const description = errorDescription(error);
  return (
    <section
      aria-label={m["tools.jsonToTomlConverter.tomlLabel"]()}
      className="flex min-h-80 flex-1 items-start p-4"
    >
      <Alert status="danger" role="alert" id={id}>
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {m["tools.jmespathTester.invalidJsonLabel"]()}
          </Alert.Title>
          <Alert.Description>{description}</Alert.Description>
        </Alert.Content>
      </Alert>
    </section>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-80 content-start gap-3 py-4"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function JsonToTomlArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
      <p>{m["tools.jsonToTomlConverter.article.purpose"]()}</p>
      <h2>{m["tools.currentNetworkTime.article.helpsTitle"]()}</h2>
      <ul>
        {[
          m["tools.jsonToTomlConverter.article.helps.item0"](),
          m["tools.jsonToTomlConverter.article.helps.item1"](),
          m["tools.jsonToTomlConverter.article.helps.item2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{m["tools.currentNetworkTime.article.watchTitle"]()}</h2>
      <ul>
        {[
          m["tools.jsonToCsvConverter.article.watchOne"](),
          m["tools.jsonToTomlConverter.article.watch.item1"](),
          m["tools.jsonToTomlConverter.article.watch.item2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function errorDescription(error: StructuredError) {
  const base =
    error.code === "precision_loss"
      ? m["tools.jsonToTomlConverter.errorsPrecisionLoss"]()
      : error.code === "too_large"
        ? m["tools.jsonToTomlConverter.errorsTooLarge"]()
        : error.code === "read_failed"
          ? m["tools.jsonToTomlConverter.errorsReadFailed"]()
          : m["tools.jsonToTomlConverter.errorsConversionFailed"]();
  if (error.line === undefined) return base;
  return `${base} ${m["tools.jsonToTomlConverter.errorsPosition"]({ line: String(error.line), column: String(error.column ?? 1) })}`;
}

function releaseReader(ref: { current: FileReader | null }, abort: boolean) {
  const reader = ref.current;
  if (!reader) return;
  reader.onload = null;
  reader.onerror = null;
  if (abort) reader.abort();
  ref.current = null;
}

function revokeUrl(ref: { current: string }) {
  if (!ref.current) return;
  URL.revokeObjectURL(ref.current);
  ref.current = "";
}

export function JsonToToml() {
  return (
    <ToolPage>
      <JsonToTomlContent />
    </ToolPage>
  );
}
