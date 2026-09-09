import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Input, Label, Skeleton, Switch } from "@heroui/react";
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
import { m } from "@/paraglide/messages.js";
import {
  type JsonOptions,
  jsonDefaults,
  MAX_XML_INPUT,
  XmlJsonError,
} from "@workspace/tools/encoding/xml-json";
import { runXmlJsonWorker } from "../xml-json/worker-client";

type ConversionState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; output: string }
  | { state: "error"; error: XmlJsonError };

const XML_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9._-]*$/;
const DEFAULT_JSON = `{
  "project": {
    "name": "InBrowserApp",
    "languages": ["en", "zh-CN", "fr"],
    "published": true,
    "owner": {
      "name": "Open Source Team",
      "email": null
    }
  }
}`;

function JsonToXmlContent() {
  const rootId = useId();
  const itemId = useId();
  const indentId = useId();
  const errorId = useId();
  const controllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const revisionRef = useRef(0);
  const downloadUrlRef = useRef("");
  const [input, setInput] = useState(DEFAULT_JSON);
  const [options, setOptions] = useState<JsonOptions>(jsonDefaults);
  const [conversionVersion, setConversionVersion] = useState(0);
  const [conversion, setConversion] = useState<ConversionState>({
    state: "loading",
  });
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredInput = useDeferredValue(input);
  const deferredOptions = useDeferredValue(options);
  const isPending =
    deferredInput !== input ||
    deferredOptions !== options ||
    conversion.state === "loading";
  const invalidRoot = !isValidXmlName(options.rootElementName);
  const invalidItem = !isValidXmlName(options.arrayItemTag);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: an imported file must rerun the Worker even when its text matches the current input
  useEffect(() => {
    if (!deferredInput.trim()) {
      setConversion({ state: "idle" });
      return;
    }
    if (
      !isValidXmlName(deferredOptions.rootElementName) ||
      !isValidXmlName(deferredOptions.arrayItemTag)
    ) {
      setConversion({
        state: "error",
        error: new XmlJsonError("invalid_options"),
      });
      return;
    }

    const revision = ++revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setConversion({ state: "loading" });
    void (async () =>
      runXmlJsonWorker(
        {
          input: deferredInput,
          direction: "json-to-xml",
          options: deferredOptions,
        },
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
              error instanceof XmlJsonError
                ? error
                : new XmlJsonError("invalid_input"),
          });
        }
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [conversionVersion, deferredInput, deferredOptions]);

  useEffect(() => {
    revokeUrl(downloadUrlRef);
    if (conversion.state !== "ready") {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([conversion.output], {
        type: "application/xml;charset=utf-8",
      }),
    );
    downloadUrlRef.current = url;
    setDownloadUrl(url);
    return () => {
      if (downloadUrlRef.current === url) revokeUrl(downloadUrlRef);
    };
  }, [conversion]);

  function changeInput(value: string) {
    if (value === input) return;
    invalidate();
    setInput(value);
    setConversion(value.trim() ? { state: "loading" } : { state: "idle" });
  }

  function changeOptions(next: JsonOptions) {
    invalidate();
    setOptions(next);
    setConversion(input.trim() ? { state: "loading" } : { state: "idle" });
  }

  function importFile(file: File) {
    invalidate();
    if (file.size > MAX_XML_INPUT) {
      setConversion({
        state: "error",
        error: new XmlJsonError("too_large"),
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
            error: new XmlJsonError("read_failed"),
          });
        }
      };
      reader.onerror = () => {
        releaseReader(readerRef, false);
        if (revision === revisionRef.current) {
          setConversion({
            state: "error",
            error: new XmlJsonError("read_failed"),
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      releaseReader(readerRef, false);
      if (revision === revisionRef.current) {
        setConversion({
          state: "error",
          error: new XmlJsonError("read_failed"),
        });
      }
    }
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-6 **:data-[slot=input]:min-h-11"
      data-tool="json-to-xml-converter"
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
              modelPath="tooltab://xml-json/json-to-xml.json"
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
              isDisabled={isPending}
              onSelect={importFile}
            />
          </div>
          <OptionsCard
            ids={{ root: rootId, item: itemId, indent: indentId }}
            invalidItem={invalidItem}
            invalidRoot={invalidRoot}
            options={options}
            onChange={changeOptions}
          />
        </div>

        <CodeBlock
          code={conversion.state === "ready" ? conversion.output : ""}
          title={m["tools.jsonToXmlConverter.xmlLabel"]()}
          description={
            <>
              {m["tools.jsonToXmlConverter.xmlDescription"]()}
              {conversion.state === "ready" &&
              conversion.output.length > 100_000 ? (
                <span className="mt-1 block">
                  {m["tools.jsonToXmlConverter.previewTruncated"]()}
                </span>
              ) : null}
            </>
          }
          language="xml"
          copyLabel={m["tools.jsonToXmlConverter.copyXmlLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          className="h-full"
          maxHeightClassName="min-h-80 max-h-[32rem]"
          previewCode={
            conversion.state === "ready"
              ? conversion.output.slice(0, 100_000)
              : undefined
          }
          actions={
            conversion.state === "ready" && downloadUrl ? (
              <a
                href={downloadUrl}
                download="converted.xml"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.jsonToXmlConverter.downloadXmlLabel"]()}
              </a>
            ) : (
              <Button size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["tools.jsonToXmlConverter.downloadXmlLabel"]()}
              </Button>
            )
          }
          statusContent={
            isPending ? (
              <OutputSkeleton
                label={m["tools.jsonToXmlConverter.xmlLabel"]()}
              />
            ) : conversion.state === "error" ? (
              <ErrorOutput
                error={conversion.error}
                id={errorId}
                invalidItem={!isValidXmlName(deferredOptions.arrayItemTag)}
                invalidRoot={!isValidXmlName(deferredOptions.rootElementName)}
              />
            ) : conversion.state === "ready" ? undefined : (
              <section
                aria-label={m["tools.jsonToXmlConverter.xmlLabel"]()}
                className="flex min-h-80 items-center justify-center px-5 text-center text-sm text-muted"
              >
                {m["tools.jsonToXmlConverter.xmlEmptyDescription"]()}
              </section>
            )
          }
        />
      </div>

      <JsonToXmlArticle />
    </div>
  );
}

function OptionsCard({
  ids,
  invalidItem,
  invalidRoot,
  options,
  onChange,
}: {
  ids: { root: string; item: string; indent: string };
  invalidItem: boolean;
  invalidRoot: boolean;
  options: JsonOptions;
  onChange: (options: JsonOptions) => void;
}) {
  return (
    <section
      aria-labelledby={`${ids.root}-options`}
      className="grid gap-4 border-t border-separator p-3"
    >
      <div>
        <h2
          id={`${ids.root}-options`}
          className="text-sm font-medium text-foreground"
        >
          {m["shared.jsonSchemaTools.options"]()}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {m["tools.jsonToXmlConverter.optionsDescription"]()}
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <OptionInput
            id={ids.root}
            label={m["tools.jsonToXmlConverter.rootElementLabel"]()}
            description={m["tools.jsonToXmlConverter.rootElementDescription"]()}
            error={
              invalidRoot
                ? m["tools.jsonToXmlConverter.invalidRootElementNameMessage"]()
                : ""
            }
            value={options.rootElementName}
            onChange={(value) =>
              onChange({ ...options, rootElementName: value })
            }
          />
          <OptionInput
            id={ids.item}
            label={m["shared.xmlJson.item"]()}
            description={m[
              "tools.jsonToXmlConverter.arrayItemTagDescription"
            ]()}
            error={
              invalidItem
                ? m["tools.jsonToXmlConverter.invalidArrayItemTagMessage"]()
                : ""
            }
            value={options.arrayItemTag}
            onChange={(value) => onChange({ ...options, arrayItemTag: value })}
          />
          <OptionInput
            id={ids.indent}
            label={m["tools.csvToJsonConverter.indentSizeLabel"]()}
            description={m["tools.csvToJsonConverter.indentSizeDescription"]()}
            value={String(options.indentSize)}
            type="number"
            onChange={(value) =>
              onChange({ ...options, indentSize: clampIndent(Number(value)) })
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <OptionSwitch
            label={m["shared.xmlJson.declaration"]()}
            description={m[
              "tools.jsonToXmlConverter.includeDeclarationDescription"
            ]()}
            selected={options.includeXmlDeclaration}
            onChange={(selected) =>
              onChange({ ...options, includeXmlDeclaration: selected })
            }
          />
          <OptionSwitch
            label={m["shared.xmlJson.fullempty"]()}
            description={m[
              "tools.jsonToXmlConverter.expandEmptyElementsDescription"
            ]()}
            selected={options.fullTagEmptyElement}
            onChange={(selected) =>
              onChange({ ...options, fullTagEmptyElement: selected })
            }
          />
        </div>
      </div>
    </section>
  );
}

function OptionInput({
  id,
  label,
  description,
  error = "",
  value,
  type = "text",
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  error?: string;
  value: string;
  type?: "number" | "text";
  onChange: (value: string) => void;
}) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        max={type === "number" ? 8 : undefined}
        value={value}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={descriptionId} className="text-xs leading-5 text-muted">
        {description}
      </p>
      {error ? (
        <p id={errorId} className="text-xs leading-5 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OptionSwitch({
  label,
  description,
  selected,
  onChange,
}: {
  label: string;
  description: string;
  selected: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border border-border bg-default/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs leading-5 text-muted">{description}</p>
      </div>
      <Switch
        aria-label={label}
        isSelected={selected}
        onChange={(value) => onChange(value === true)}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}

function ErrorOutput({
  error,
  id,
  invalidItem,
  invalidRoot,
}: {
  error: XmlJsonError;
  id: string;
  invalidItem: boolean;
  invalidRoot: boolean;
}) {
  return (
    <Alert status="danger" role="alert" id={id}>
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>
          {error.code === "invalid_options"
            ? m["tools.jsonToXmlConverter.invalidXmlTagLabel"]()
            : m["tools.jmespathTester.invalidJsonLabel"]()}
        </Alert.Title>
        <Alert.Description>
          {invalidRoot
            ? m["tools.jsonToXmlConverter.invalidRootElementNameMessage"]()
            : invalidItem
              ? m["tools.jsonToXmlConverter.invalidArrayItemTagMessage"]()
              : errorDescription(error)}
        </Alert.Description>
      </Alert.Content>
    </Alert>
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

function JsonToXmlArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
      <p>{m["tools.jsonToXmlConverter.articlePurposeBody"]()}</p>
      <h2>{m["tools.currentNetworkTime.article.helpsTitle"]()}</h2>
      <ul>
        {[
          m["tools.jsonToXmlConverter.articleHelpsItems0"](),
          m["tools.jsonToXmlConverter.articleHelpsItems1"](),
          m["tools.jsonToXmlConverter.articleHelpsItems2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{m["tools.currentNetworkTime.article.watchTitle"]()}</h2>
      <ul>
        {[
          m["tools.jsonToCsvConverter.article.watchOne"](),
          m["tools.jsonToXmlConverter.articleWatchItems1"](),
          m["tools.jsonToXmlConverter.articleWatchItems2"](),
          m["tools.jsonToXmlConverter.articleWatchItems3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function errorDescription(error: XmlJsonError) {
  const base =
    error.code === "invalid_character"
      ? m["tools.jsonToXmlConverter.errorsInvalidCharacter"]()
      : error.code === "too_large"
        ? m["tools.jsonToTomlConverter.errorsTooLarge"]()
        : error.code === "read_failed"
          ? m["tools.jsonToTomlConverter.errorsReadFailed"]()
          : m["tools.jsonToXmlConverter.errorsConversionFailed"]();
  if (error.line === undefined) return base;
  return `${base} ${m["tools.jsonToTomlConverter.errorsPosition"]({ line: String(error.line), column: String(error.column ?? 1) })}`;
}

function isValidXmlName(value: string) {
  return XML_NAME_PATTERN.test(value.trim());
}

function clampIndent(value: number) {
  if (!Number.isFinite(value)) return jsonDefaults.indentSize;
  return Math.min(8, Math.max(0, Math.round(value)));
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

export function JsonToXml() {
  return (
    <ToolPage>
      <JsonToXmlContent />
    </ToolPage>
  );
}
