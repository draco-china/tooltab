import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
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
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  MAX_STRUCTURED_INPUT,
  StructuredError,
} from "@workspace/tools/encoding/structured";
import { runStructuredWorker } from "../structured-formats/worker-client";

const DEFAULT_JSON = `{
  "hello": "world",
  "items": [1, 2, 3],
  "nested": { "a": true, "b": null }
}`;
const STORAGE_KEY = "tools:json-to-yaml-converter:json-text";

type State =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; output: string }
  | { state: "error"; error: StructuredError };

function JsonToYamlContent() {
  const errorId = useId();
  const task = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const revision = useRef(0);
  const urlRef = useRef("");
  const [input, setInput] = useState(DEFAULT_JSON);
  const [version, setVersion] = useState(0);
  const [conversion, setConversion] = useState<State>({ state: "loading" });
  const [url, setUrl] = useState("");
  const deferredInput = useDeferredValue(input);
  const pending = deferredInput !== input || conversion.state === "loading";

  useEffect(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEY);
    if (stored !== null) setInput(stored);
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEY, input);
  }, [input]);

  function invalidate() {
    revision.current++;
    task.current?.abort();
    task.current = null;
    releaseReader(reader, true);
    revokeUrl(urlRef);
    setUrl("");
  }

  useEffect(
    () => () => {
      revision.current++;
      task.current?.abort();
      task.current = null;
      releaseReader(reader, true);
      revokeUrl(urlRef);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: importing the same text must still start a fresh conversion
  useEffect(() => {
    if (!deferredInput.trim()) {
      setConversion({ state: "idle" });
      return;
    }
    const current = ++revision.current;
    const controller = new AbortController();
    task.current = controller;
    setConversion({ state: "loading" });
    void (async () =>
      runStructuredWorker(
        { input: deferredInput, from: "json", to: "yaml" },
        controller.signal,
      ))()
      .then((result) => {
        if (current === revision.current && task.current === controller)
          setConversion({ state: "ready", output: result.output });
      })
      .catch((error) => {
        if (
          current === revision.current &&
          task.current === controller &&
          !controller.signal.aborted
        )
          setConversion({
            state: "error",
            error:
              error instanceof StructuredError
                ? error
                : new StructuredError("invalid_input"),
          });
      })
      .finally(() => {
        if (task.current === controller) task.current = null;
      });
    return () => {
      controller.abort();
      if (task.current === controller) task.current = null;
    };
  }, [deferredInput, version]);

  useEffect(() => {
    revokeUrl(urlRef);
    if (conversion.state !== "ready") {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(
      new Blob([conversion.output], { type: "text/yaml;charset=utf-8" }),
    );
    urlRef.current = next;
    setUrl(next);
    return () => {
      if (urlRef.current === next) revokeUrl(urlRef);
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
    const currentRevision = revision.current;
    let current: FileReader;
    try {
      current = new FileReader();
    } catch {
      setConversion({
        state: "error",
        error: new StructuredError("read_failed"),
      });
      return;
    }
    reader.current = current;
    setConversion({ state: "loading" });
    current.onload = () => {
      const result = current.result;
      releaseReader(reader, false);
      if (
        currentRevision !== revision.current ||
        !(result instanceof ArrayBuffer)
      )
        return;
      try {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(result);
        startTransition(() => {
          setInput(value);
          setVersion((value) => value + 1);
        });
      } catch {
        setConversion({
          state: "error",
          error: new StructuredError("read_failed"),
        });
      }
    };
    current.onerror = () => {
      releaseReader(reader, false);
      if (currentRevision === revision.current)
        setConversion({
          state: "error",
          error: new StructuredError("read_failed"),
        });
    };
    current.onabort = () => releaseReader(reader, false);
    current.readAsArrayBuffer(file);
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-6 **:data-[slot=input]:min-h-11"
      data-tool="json-to-yaml-converter"
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-2" data-tool-panels>
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
              modelPath="tooltab://structured/json-to-yaml.json"
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
              description={m["tools.jsonFormatter.rawJsonDescription"]()}
              accept={[".json", ".txt", "application/json", "text/plain"]}
              isDisabled={pending}
              onSelect={importFile}
            />
          </div>
        </div>

        <CodeBlock
          code={conversion.state === "ready" ? conversion.output : ""}
          title={m["tools.jsonToYamlConverter.yamlLabel"]()}
          description={m["tools.jsonToYamlConverter.yamlDescription"]()}
          language="yaml"
          copyLabel={m["tools.jsonToYamlConverter.copyYamlLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          className="h-full"
          maxHeightClassName="min-h-80 max-h-[32rem]"
          previewCode={
            conversion.state === "ready"
              ? conversion.output.slice(0, 100_000)
              : undefined
          }
          actions={
            conversion.state === "ready" && url ? (
              <a
                href={url}
                download="converted.yaml"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.jsonToYamlConverter.downloadYamlLabel"]()}
              </a>
            ) : (
              <Button size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["tools.jsonToYamlConverter.downloadYamlLabel"]()}
              </Button>
            )
          }
          statusContent={
            pending ? (
              <OutputSkeleton
                label={m["tools.jsonToYamlConverter.yamlLabel"]()}
              />
            ) : conversion.state === "error" ? (
              <ErrorOutput error={conversion.error} id={errorId} />
            ) : conversion.state === "ready" ? undefined : (
              <section
                aria-label={m["tools.jsonToYamlConverter.yamlLabel"]()}
                className="flex min-h-80 items-center justify-center px-5 text-center text-sm text-muted"
              >
                {m["tools.jsonToYamlConverter.yamlEmptyDescription"]()}
              </section>
            )
          }
        />
      </div>
      <ToolArticle>
        <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
        <p>{m["tools.jsonToYamlConverter.articlePurposeBody"]()}</p>
        <h2>{m["tools.currentNetworkTime.article.helpsTitle"]()}</h2>
        <ul>
          {[
            m["tools.jsonToYamlConverter.article.helps.item0"](),
            m["tools.jsonToTomlConverter.article.helps.item1"](),
            m["tools.jsonToYamlConverter.article.helps.item2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.currentNetworkTime.article.watchTitle"]()}</h2>
        <ul>
          {[
            m["tools.jsonToCsvConverter.article.watchOne"](),
            m["tools.jsonToYamlConverter.article.watch.item1"](),
            m["tools.jsonToYamlConverter.articleWatchItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-80 content-start gap-3"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function ErrorOutput({ error, id }: { error: StructuredError; id: string }) {
  const base =
    error.code === "precision_loss"
      ? m["tools.jsonToYamlConverter.errorsPrecisionLoss"]()
      : error.code === "too_large"
        ? m["tools.jsonToYamlConverter.errorsTooLarge"]()
        : error.code === "read_failed"
          ? m["tools.jsonToTomlConverter.errorsReadFailed"]()
          : m["tools.jsonToYamlConverter.errorsConversionFailed"]();
  const description =
    error.line === undefined
      ? base
      : `${base} ${m["tools.jsonToYamlConverter.errorsPosition"]({ line: String(error.line), column: String(error.column ?? 1) })}`;
  return (
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
  );
}

function releaseReader(ref: { current: FileReader | null }, abort: boolean) {
  const current = ref.current;
  if (!current) return;
  current.onload = null;
  current.onerror = null;
  current.onabort = null;
  if (abort) current.abort();
  ref.current = null;
}

function revokeUrl(ref: { current: string }) {
  if (!ref.current) return;
  URL.revokeObjectURL(ref.current);
  ref.current = "";
}

export function JsonToYaml() {
  return (
    <ToolPage>
      <JsonToYamlContent />
    </ToolPage>
  );
}
