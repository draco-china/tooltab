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
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  MAX_STRUCTURED_INPUT,
  StructuredError,
} from "@workspace/tools/encoding/structured";
import { runStructuredWorker } from "./worker-client";

type Message = (typeof m)["common.processing"];
type ConversionConfiguration = {
  from: "yaml" | "toml";
  to: "json" | "yaml" | "toml";
  storageKey: string;
  modelPath: string;
  initialInput: string;
  accept: string[];
  messages: {
    inputLabel: Message;
    inputDescription: Message;
    inputPlaceholder: Message;
    outputLabel: Message;
    outputDescription: Message;
    copyOutput: Message;
    downloadOutput: Message;
    emptyOutput: Message;
    invalidInput: Message;
    conversionFailed: Message;
    purposeTitle: Message;
    purposeBody: Message;
    helpsTitle: Message;
    helpsItems: Message[];
    watchTitle: Message;
    watchItems: Message[];
  };
};
type Locale = ReturnType<typeof getLocale>;
type ConversionState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; output: string }
  | { state: "error"; error: StructuredError };

const DEFAULT_YAML = `title: YAML Example
owner:
  name: Tom Preston-Werner
database:
  ports:
    - 8001
    - 8001
    - 8002
  enabled: true
`;

const DEFAULT_TOML = `title = "TOML Example"

[owner]
name = "Tom Preston-Werner"

[database]
ports = [8001, 8001, 8002]
enabled = true
`;
const yamlToJson = {
  from: "yaml",
  to: "json",
  storageKey: "tools:yaml-to-json-converter:yaml-text",
  modelPath: "tooltab://structured/yaml-to-json-converter.yaml",
  initialInput: DEFAULT_YAML,
  accept: [
    ".yaml",
    ".yml",
    ".txt",
    "application/yaml",
    "text/yaml",
    "text/plain",
  ],
  messages: {
    inputLabel: m["tools.jsonToYamlConverter.yamlLabel"],
    inputDescription:
      m["common.catalogToolYamlToJsonConverterClientYamlDescription"],
    inputPlaceholder:
      m["common.catalogToolYamlToJsonConverterClientYamlPlaceholder"],
    outputLabel: m["tools.csvToJsonConverter.jsonLabel"],
    outputDescription: m["tools.yamlToJsonConverter.clientJsonDescription"],
    copyOutput: m["shared.aesTools.encryptcopyjsonlabel"],
    downloadOutput: m["common.httptDownload"],
    emptyOutput: m["tools.yamlToJsonConverter.clientJsonEmptyDescription"],
    invalidInput:
      m["common.catalogToolYamlToJsonConverterClientInvalidYamlLabel"],
    conversionFailed: m["tools.yamlToJsonConverter.errorsConversionFailed"],
    purposeTitle: m["tools.csvToJsonConverter.article.whatTitle"],
    purposeBody: m["tools.yamlToJsonConverter.articlePurposeBody"],
    helpsTitle: m["tools.currentNetworkTime.article.helpsTitle"],
    helpsItems: [
      m["common.catalogToolTomlToJsonConverterArticleHelpsItems0"],
      m["common.catalogToolYamlToJsonConverterArticleHelpsItems1"],
      m["common.catalogToolTomlToJsonConverterArticleHelpsItems2"],
    ],
    watchTitle: m["tools.currentNetworkTime.article.watchTitle"],
    watchItems: [
      m["common.catalogToolYamlToJsonConverterArticleWatchItems0"],
      m["common.catalogToolTomlToJsonConverterArticleWatchItems1"],
      m["tools.yamlToJsonConverter.articleWatchItems2"],
    ],
  },
} satisfies ConversionConfiguration;
const yamlToToml = {
  from: "yaml",
  to: "toml",
  storageKey: "tools:yaml-to-toml-converter:yaml-text",
  modelPath: "tooltab://structured/yaml-to-toml-converter.yaml",
  initialInput: DEFAULT_YAML,
  accept: [
    ".yaml",
    ".yml",
    ".txt",
    "application/yaml",
    "text/yaml",
    "text/plain",
  ],
  messages: {
    downloadOutput: m["tools.jsonToTomlConverter.downloadTomlLabel"],
    inputLabel: m["tools.jsonToYamlConverter.yamlLabel"],
    inputDescription:
      m["common.catalogToolYamlToJsonConverterClientYamlDescription"],
    inputPlaceholder:
      m["common.catalogToolYamlToJsonConverterClientYamlPlaceholder"],
    outputLabel: m["tools.jsonToTomlConverter.tomlLabel"],
    outputDescription: m["tools.yamlToTomlConverter.clientTomlDescription"],
    copyOutput: m["tools.jsonToTomlConverter.copyTomlLabel"],
    emptyOutput: m["tools.yamlToTomlConverter.clientTomlEmptyDescription"],
    invalidInput:
      m["common.catalogToolYamlToJsonConverterClientInvalidYamlLabel"],
    conversionFailed: m["tools.yamlToTomlConverter.errorsConversionFailed"],
    purposeTitle: m["tools.csvToJsonConverter.article.whatTitle"],
    purposeBody: m["tools.yamlToTomlConverter.articlePurposeBody"],
    helpsTitle: m["tools.currentNetworkTime.article.helpsTitle"],
    helpsItems: [
      m["tools.jsonToTomlConverter.article.helps.item0"],
      m["common.catalogToolYamlToJsonConverterArticleHelpsItems1"],
      m["tools.jsonToTomlConverter.article.helps.item2"],
    ],
    watchTitle: m["tools.currentNetworkTime.article.watchTitle"],
    watchItems: [
      m["common.catalogToolYamlToJsonConverterArticleWatchItems0"],
      m["tools.jsonToTomlConverter.article.watch.item1"],
      m["tools.yamlToTomlConverter.articleWatchItems2"],
    ],
  },
} satisfies ConversionConfiguration;
const tomlToYaml = {
  from: "toml",
  to: "yaml",
  storageKey: "tools:toml-to-yaml-converter:toml-text",
  modelPath: "tooltab://structured/toml-to-yaml-converter.toml",
  initialInput: DEFAULT_TOML,
  accept: [".toml", ".txt", "application/toml", "text/plain"],
  messages: {
    downloadOutput: m["tools.jsonToYamlConverter.downloadYamlLabel"],
    inputLabel: m["tools.jsonToTomlConverter.tomlLabel"],
    inputDescription:
      m["common.catalogToolTomlToJsonConverterClientTomlDescription"],
    inputPlaceholder:
      m["common.catalogToolTomlToJsonConverterClientTomlPlaceholder"],
    outputLabel: m["tools.jsonToYamlConverter.yamlLabel"],
    outputDescription: m["tools.tomlToYamlConverter.clientYamlDescription"],
    copyOutput: m["tools.jsonToYamlConverter.copyYamlLabel"],
    emptyOutput: m["tools.tomlToYamlConverter.clientYamlEmptyDescription"],
    invalidInput:
      m["common.catalogToolTomlToJsonConverterClientInvalidTomlLabel"],
    conversionFailed: m["tools.tomlToYamlConverter.errorsConversionFailed"],
    purposeTitle: m["tools.csvToJsonConverter.article.whatTitle"],
    purposeBody: m["tools.tomlToYamlConverter.articlePurposeBody"],
    helpsTitle: m["tools.currentNetworkTime.article.helpsTitle"],
    helpsItems: [
      m["tools.jsonToYamlConverter.article.helps.item0"],
      m["common.catalogToolTomlToJsonConverterArticleHelpsItems1"],
      m["tools.jsonToYamlConverter.article.helps.item2"],
    ],
    watchTitle: m["tools.currentNetworkTime.article.watchTitle"],
    watchItems: [
      m["common.catalogToolTomlToJsonConverterArticleWatchItems0"],
      m["tools.jsonToYamlConverter.article.watch.item1"],
      m["tools.tomlToYamlConverter.articleWatchItems2"],
    ],
  },
} satisfies ConversionConfiguration;

function createConversionPage(config: ConversionConfiguration) {
  return function StructuredConversionPage() {
    const locale = getLocale();
    const errorId = useId();
    const controllerRef = useRef<AbortController | null>(null);
    const readerRef = useRef<FileReader | null>(null);
    const revisionRef = useRef(0);
    const downloadUrlRef = useRef("");
    const [input, setInput] = useState(config.initialInput);
    const [conversionVersion, setConversionVersion] = useState(0);
    const [conversion, setConversion] = useState<ConversionState>({
      state: "loading",
    });
    const [downloadUrl, setDownloadUrl] = useState("");
    useEffect(() => {
      const stored = safeLocalStorage.getItem(config.storageKey);
      if (stored !== null) setInput(stored);
    }, []);
    useEffect(() => {
      safeLocalStorage.setItem(config.storageKey, input);
    }, [input]);
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
      let task: ReturnType<typeof runStructuredWorker>;
      try {
        task = runStructuredWorker(
          { input: deferredInput, from: config.from, to: config.to },
          controller.signal,
        );
      } catch (error) {
        task = Promise.reject(error);
      }
      void task
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
          type: `text/${config.to};charset=utf-8`,
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
      anchor.download = `converted.${config.to}`;
      anchor.click();
    }

    return (
      <div className="grid gap-8">
        <div
          className="grid items-stretch gap-6 xl:grid-cols-2"
          data-tool-panels
        >
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
            <div className="relative">
              <CodeEditor
                embedded
                title={config.messages.inputLabel({}, { locale })}
                description={config.messages.inputDescription({}, { locale })}
                aria-label={config.messages.inputLabel({}, { locale })}
                aria-describedby={
                  conversion.state === "error" ? errorId : undefined
                }
                aria-invalid={conversion.state === "error"}
                language={config.from}
                modelPath={config.modelPath}
                value={input}
                height={320}
                onChange={changeInput}
              />
              {!input ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
                >
                  {config.messages.inputPlaceholder({}, { locale })}
                </span>
              ) : null}
            </div>
            <div className="border-t border-separator p-3">
              <ToolFilePicker
                label={m["common.adler32importfromfilelabel"]({}, { locale })}
                accept={config.accept}
                isDisabled={isPending}
                onSelect={importFile}
              />
            </div>
          </div>

          <div className="min-w-0" aria-busy={isPending}>
            {isPending ? (
              <OutputSkeleton
                label={config.messages.outputLabel({}, { locale })}
              />
            ) : conversion.state === "error" ? (
              <ErrorOutput
                config={config}
                locale={locale}
                error={conversion.error}
                id={errorId}
              />
            ) : conversion.state === "ready" ? (
              <>
                <CodeBlock
                  code={conversion.output}
                  title={config.messages.outputLabel({}, { locale })}
                  description={config.messages.outputDescription(
                    {},
                    { locale },
                  )}
                  language={config.to}
                  copyLabel={config.messages.copyOutput({}, { locale })}
                  copiedLabel={m["common.actions.copied"]({}, { locale })}
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
                      {config.messages.downloadOutput({}, { locale })}
                    </Button>
                  }
                />
                {conversion.output.length > 100_000 ? (
                  <p className="mt-3 text-sm text-muted">
                    {m["common.catalogToolTomlToJsonConverterPreviewTruncated"](
                      {},
                      { locale },
                    )}
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyOutput config={config} locale={locale} />
            )}
          </div>
        </div>

        <ConversionArticle config={config} locale={locale} />
      </div>
    );
  };
}

const YamlToJsonContent = createConversionPage(yamlToJson);
const YamlToTomlContent = createConversionPage(yamlToToml);
const TomlToYamlContent = createConversionPage(tomlToYaml);

function EmptyOutput({
  config,
  locale,
}: {
  config: ConversionConfiguration;
  locale: Locale;
}) {
  return (
    <section
      aria-label={config.messages.outputLabel({}, { locale })}
      className="flex min-h-80 flex-1 items-center p-6"
    >
      <p className="text-sm leading-6 text-muted">
        {config.messages.emptyOutput({}, { locale })}
      </p>
    </section>
  );
}

function ErrorOutput({
  config,
  locale,
  error,
  id,
}: {
  config: ConversionConfiguration;
  locale: Locale;
  error: StructuredError;
  id: string;
}) {
  const description = errorDescription(error, config, locale);
  return (
    <section
      aria-label={config.messages.outputLabel({}, { locale })}
      className="flex min-h-80 flex-1 items-start p-4"
    >
      <Alert status="danger" role="alert" id={id}>
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {config.messages.invalidInput({}, { locale })}
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

function ConversionArticle({
  config,
  locale,
}: {
  config: ConversionConfiguration;
  locale: Locale;
}) {
  return (
    <ToolArticle>
      <h2>{config.messages.purposeTitle({}, { locale })}</h2>
      <p>{config.messages.purposeBody({}, { locale })}</p>
      <h2>{config.messages.helpsTitle({}, { locale })}</h2>
      <ul>
        {config.messages.helpsItems.map((message) => {
          const item = message({}, { locale });
          return <li key={item}>{item}</li>;
        })}
      </ul>
      <h2>{config.messages.watchTitle({}, { locale })}</h2>
      <ul>
        {config.messages.watchItems.map((message) => {
          const item = message({}, { locale });
          return <li key={item}>{item}</li>;
        })}
      </ul>
    </ToolArticle>
  );
}

function errorDescription(
  error: StructuredError,
  config: ConversionConfiguration,
  locale: Locale,
) {
  const base =
    error.code === "precision_loss"
      ? m["tools.jsonToTomlConverter.errorsPrecisionLoss"]({}, { locale })
      : error.code === "too_large"
        ? m["tools.jsonToTomlConverter.errorsTooLarge"]({}, { locale })
        : error.code === "read_failed"
          ? m["tools.jsonToTomlConverter.errorsReadFailed"]({}, { locale })
          : config.messages.conversionFailed({}, { locale });
  if (error.line === undefined) return base;
  return `${base} ${m["tools.jsonToTomlConverter.errorsPosition"]({ line: error.line, column: error.column ?? 1 }, { locale })}`;
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

export const TomlToYaml = () => (
  <ToolPage>
    <TomlToYamlContent />
  </ToolPage>
);

export const YamlToJson = () => (
  <ToolPage>
    <YamlToJsonContent />
  </ToolPage>
);

export const YamlToToml = () => (
  <ToolPage>
    <YamlToTomlContent />
  </ToolPage>
);
