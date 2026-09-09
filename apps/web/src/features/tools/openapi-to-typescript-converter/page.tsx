import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Skeleton,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  Braces,
  Download,
  FileCode2,
  Globe,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import {
  OPENAPI_INPUT_LIMIT,
  type OpenapiResult,
  openapiOptionsSchema,
  ProjectConfigError,
} from "@workspace/tools/project/openapi-contract";
import { runOpenapiWorker } from "./worker-client";

const LARGE_INPUT_THRESHOLD = 120_000;
const SAMPLE_OPENAPI_DOCUMENT = `openapi: 3.1.0
info:
  title: Sample API
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/User"
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        role:
          type: string
          enum:
            - admin
            - editor
            - viewer
      required:
        - id
        - name
`;

const OPTION_LABELS = {
  additionalProperties: m["common.projectoptionadditionalproperties"],
  defaultNonNullable:
    m["tools.openapiToTypescriptConverter.defaultNonNullableLabel"],
  propertiesRequiredByDefault:
    m["tools.openapiToTypescriptConverter.propertiesRequiredByDefaultLabel"],
  exportType: m["tools.openapiToTypescriptConverter.useTypeAliasesLabel"],
  enum: m["tools.openapiToTypescriptConverter.generateEnumsLabel"],
  pathParamsAsTypes:
    m["tools.openapiToTypescriptConverter.pathParamsAsTypesLabel"],
  rootTypes: m["tools.openapiToTypescriptConverter.generateRootTypesLabel"],
  makePathsEnum: m["tools.openapiToTypescriptConverter.generatePathsEnumLabel"],
  generatePathParams:
    m["tools.openapiToTypescriptConverter.generatePathParamHelpersLabel"],
  immutable: m["tools.openapiToTypescriptConverter.immutableTypesLabel"],
  excludeDeprecated: m["common.projectoptionexcludedeprecated"],
  includeHeader:
    m["tools.openapiToTypescriptConverter.includeHeaderCommentLabel"],
} as const;

type Options = ReturnType<typeof openapiOptionsSchema.parse>;
type UiError =
  | ProjectConfigError
  | { code: "read_failed"; refs: readonly string[] };

function errorCopy(error: UiError) {
  if (error.code === "external_ref")
    return {
      title: m["tools.openapiToTypescriptConverter.externalRefsLabel"](),
      description:
        m["tools.openapiToTypescriptConverter.externalRefsDescription"](),
    };
  if (error.code === "unsupported_version")
    return {
      title: m["tools.openapiToTypescriptConverter.invalidDocumentMessage"](),
      description:
        m["tools.openapiToTypescriptConverter.unsupportedVersionMessage"](),
    };
  if (error.code === "too_large")
    return {
      title: m["tools.openapiToTypescriptConverter.invalidDocumentMessage"](),
      description: m["tools.openapiToTypescriptConverter.localTooLargeError"](),
    };
  if (error.code === "timeout")
    return {
      title: m["tools.openapiToTypescriptConverter.generationErrorLabel"](),
      description:
        m["tools.openapiToTypescriptConverter.localGenerationTimeoutError"](),
    };
  if (error.code === "unsupported")
    return {
      title: m["tools.openapiToTypescriptConverter.generationErrorLabel"](),
      description:
        m["tools.openapiToTypescriptConverter.localUnsupportedBrowserError"](),
    };
  if (error.code === "read_failed")
    return {
      title: m["tools.openapiToTypescriptConverter.invalidDocumentMessage"](),
      description: m["tools.openapiToTypescriptConverter.localReadError"](),
    };
  if (error.code === "generation_failed" || error.code === "busy")
    return {
      title: m["tools.openapiToTypescriptConverter.generationErrorLabel"](),
      description:
        m["tools.openapiToTypescriptConverter.generationErrorLabel"](),
    };
  return {
    title: m["tools.openapiToTypescriptConverter.invalidDocumentMessage"](),
    description:
      m["tools.openapiToTypescriptConverter.invalidDocumentMessage"](),
  };
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid min-h-[16em] content-start gap-3 p-4"
    >
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-5/6" />
    </section>
  );
}

function disposeFileReader(current: FileReader | null) {
  if (!current) return;
  current.onload = null;
  current.onerror = null;
  current.onabort = null;
  if (current.readyState === FileReader.LOADING) current.abort();
}

function OpenapiToTypescriptConverterContent() {
  const [input, setInput] = useState(SAMPLE_OPENAPI_DOCUMENT);
  const [options, setOptions] = useState<Options>(() =>
    openapiOptionsSchema.parse({}),
  );
  const [result, setResult] = useState<OpenapiResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(true);
  const [forceVersion, setForceVersion] = useState(0);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importUrlError, setImportUrlError] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [fileName, setFileName] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const revision = useRef(0);
  const task = useRef<AbortController | null>(null);
  const fetchTask = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const timer = useRef<number | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const pendingLargeGenerate =
    input.length >= LARGE_INPUT_THRESHOLD && forceVersion === 0;

  function revokeDownload() {
    if (!downloadUrlRef.current) return;
    URL.revokeObjectURL(downloadUrlRef.current);
    downloadUrlRef.current = null;
    setDownloadUrl(null);
  }

  function abortReader() {
    const current = reader.current;
    if (!current) return;
    disposeFileReader(current);
    reader.current = null;
  }

  function abortPendingWork() {
    revision.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    task.current?.abort();
    task.current = null;
    fetchTask.current?.abort();
    fetchTask.current = null;
    abortReader();
    revokeDownload();
    setResult(null);
    setError(null);
    setBusy(false);
    setFetchingUrl(false);
  }

  useEffect(() => {
    const current = ++revision.current;
    if (timer.current !== null) window.clearTimeout(timer.current);
    task.current?.abort();
    task.current = null;
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setDownloadUrl(null);
    setResult(null);
    setError(null);
    if (!input.trim() || pendingLargeGenerate) {
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    timer.current = window.setTimeout(
      async () => {
        timer.current = null;
        try {
          const next = await runOpenapiWorker(
            { input, options },
            controller.signal,
          );
          if (controller.signal.aborted || current !== revision.current) return;
          const nextUrl = URL.createObjectURL(
            new Blob([next.output], { type: "text/plain;charset=utf-8" }),
          );
          downloadUrlRef.current = nextUrl;
          setDownloadUrl(nextUrl);
          setResult(next);
        } catch (cause) {
          if (controller.signal.aborted || current !== revision.current) return;
          setError(
            cause instanceof ProjectConfigError
              ? cause
              : new ProjectConfigError("generation_failed"),
          );
        } finally {
          if (!controller.signal.aborted && current === revision.current) {
            task.current = null;
            setBusy(false);
          }
        }
      },
      forceVersion > 0 ? 0 : 250,
    );

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      controller.abort();
    };
  }, [forceVersion, input, options, pendingLargeGenerate]);

  useEffect(
    () => () => {
      revision.current += 1;
      if (timer.current !== null) window.clearTimeout(timer.current);
      task.current?.abort();
      fetchTask.current?.abort();
      disposeFileReader(reader.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    },
    [],
  );

  function replaceInput(value: string, importedName = "") {
    abortPendingWork();
    setForceVersion(0);
    setInput(value);
    setFileName(importedName);
  }

  function importFile(file: File) {
    abortPendingWork();
    setFileName("");
    if (file.size > OPENAPI_INPUT_LIMIT) {
      setError(new ProjectConfigError("too_large"));
      return;
    }
    const current = revision.current;
    const nextReader = new FileReader();
    reader.current = nextReader;
    setBusy(true);
    const finish = () => {
      nextReader.onload = null;
      nextReader.onerror = null;
      nextReader.onabort = null;
      if (reader.current === nextReader) reader.current = null;
    };
    nextReader.onerror = () => {
      finish();
      if (current !== revision.current) return;
      setError({ code: "read_failed", refs: [] });
      setBusy(false);
    };
    nextReader.onload = () => {
      const contents = nextReader.result;
      finish();
      if (current !== revision.current) return;
      try {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(
          contents as ArrayBuffer,
        );
        setInput(value);
        setFileName(file.name);
        if (value.length >= LARGE_INPUT_THRESHOLD) {
          setForceVersion(0);
          setBusy(false);
        } else {
          setForceVersion((version) => version + 1);
        }
      } catch {
        setError({ code: "read_failed", refs: [] });
        setBusy(false);
      }
    };
    nextReader.readAsArrayBuffer(file);
  }

  async function fetchFromUrl() {
    const value = importUrl.trim();
    if (!value) {
      setImportUrlError(
        m["tools.openapiToTypescriptConverter.importUrlEmptyError"](),
      );
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      setImportUrlError(
        m["tools.openapiToTypescriptConverter.importUrlInvalidError"](),
      );
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setImportUrlError(
        m["tools.openapiToTypescriptConverter.importUrlInvalidError"](),
      );
      return;
    }

    abortPendingWork();
    const current = revision.current;
    const controller = new AbortController();
    fetchTask.current = controller;
    setFetchingUrl(true);
    setImportUrlError("");
    try {
      const response = await fetch(value, {
        mode: "cors",
        signal: controller.signal,
      });
      if (!response.ok) {
        const message =
          `${response.status || ""}${response.statusText ? ` ${response.statusText}` : ""}`.trim();
        throw new Error(message || "Request failed");
      }
      const next = await response.text();
      if (controller.signal.aborted || current !== revision.current) return;
      if (new TextEncoder().encode(next).length > OPENAPI_INPUT_LIMIT) {
        setError(new ProjectConfigError("too_large"));
        return;
      }
      setForceVersion(0);
      setInput(next);
      setFileName("");
      setShowUrlImport(false);
      if (next.length < LARGE_INPUT_THRESHOLD)
        setForceVersion((version) => version + 1);
    } catch (cause) {
      if (controller.signal.aborted || current !== revision.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setImportUrlError(
        m["tools.openapiToTypescriptConverter.importUrlFetchError"]({
          message,
        }),
      );
    } finally {
      if (current === revision.current) {
        fetchTask.current = null;
        setFetchingUrl(false);
      }
    }
  }

  const errorMessage = error ? errorCopy(error) : null;
  const output = result?.output ?? "";

  return (
    <div
      className="grid min-w-0 gap-6 **:data-[slot=input]:min-h-11"
      data-tool="openapi-to-typescript-converter"
    >
      <div className="grid min-w-0 items-stretch gap-6 xl:grid-cols-2">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.openapiToTypescriptConverter.openApiLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.openapiToTypescriptConverter.openApiDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={!input}
                onPress={() => replaceInput("")}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.curlClear"]()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => {
                  abortPendingWork();
                  setInput(SAMPLE_OPENAPI_DOCUMENT);
                  setOptions(openapiOptionsSchema.parse({}));
                  setForceVersion((version) => version + 1);
                  setFileName("");
                  setImportUrl("");
                  setImportUrlError("");
                  setShowUrlImport(false);
                }}
              >
                <Sparkles aria-hidden className="size-4" />
                {m["common.curlSample"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {showUrlImport ? (
              <TextField
                fullWidth
                isInvalid={Boolean(importUrlError)}
                className="grid gap-2"
              >
                <Label>
                  {m[
                    "tools.openapiToTypescriptConverter.importUrlFieldLabel"
                  ]()}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="url"
                    value={importUrl}
                    placeholder={m[
                      "tools.openapiToTypescriptConverter.importUrlPlaceholder"
                    ]()}
                    aria-label={m[
                      "tools.openapiToTypescriptConverter.importUrlFieldLabel"
                    ]()}
                    disabled={fetchingUrl}
                    onChange={(event) => {
                      setImportUrl(event.currentTarget.value);
                      setImportUrlError("");
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void fetchFromUrl();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    isDisabled={fetchingUrl}
                    onPress={() => void fetchFromUrl()}
                  >
                    <Globe aria-hidden className="size-4" />
                    {fetchingUrl
                      ? m[
                          "tools.openapiToTypescriptConverter.fetchingUrlLabel"
                        ]()
                      : m["tools.openapiToTypescriptConverter.fetchUrlLabel"]()}
                  </Button>
                </div>
                <p className="text-sm text-muted">
                  {m[
                    "tools.openapiToTypescriptConverter.importUrlDescription"
                  ]()}
                </p>
                {importUrlError ? (
                  <p role="alert" className="text-sm text-danger">
                    {importUrlError}
                  </p>
                ) : null}
              </TextField>
            ) : null}

            {pendingLargeGenerate ? (
              <p className="text-sm leading-6 text-muted">
                {m["tools.openapiToTypescriptConverter.generationPausedHint"]()}
              </p>
            ) : null}

            <TextArea
              aria-label={m[
                "tools.openapiToTypescriptConverter.openApiLabel"
              ]()}
              aria-invalid={Boolean(error)}
              spellCheck={false}
              value={input}
              placeholder={m[
                "tools.openapiToTypescriptConverter.openApiPlaceholder"
              ]()}
              className="h-[16em] min-h-[16em] resize-y font-mono text-sm"
              onChange={(event) => {
                if (event.currentTarget.value.length <= OPENAPI_INPUT_LIMIT)
                  replaceInput(event.currentTarget.value);
              }}
            />

            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[
                ".json",
                ".yaml",
                ".yml",
                ".txt",
                "application/json",
                "text/plain",
              ]}
              fileName={fileName}
              clearLabel={m["common.curlClear"]()}
              onSelect={importFile}
              onClear={() => replaceInput("")}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex flex-wrap justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setShowUrlImport((value) => !value);
                  setImportUrlError("");
                }}
              >
                <Globe aria-hidden className="size-4" />
                {showUrlImport
                  ? m["tools.openapiToTypescriptConverter.hideUrlImportLabel"]()
                  : m[
                      "tools.openapiToTypescriptConverter.importFromUrlLabel"
                    ]()}
              </Button>
            </div>
            {pendingLargeGenerate ? (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onPress={() => setForceVersion((value) => value + 1)}
              >
                <Braces aria-hidden className="size-4" />
                {m["tools.openapiToTypescriptConverter.generateNowLabel"]()}
              </Button>
            ) : null}
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <CodeBlock
          code={output}
          previewCode={output.slice(0, 50_000)}
          title={m["tools.openapiToTypescriptConverter.typescriptLabel"]()}
          description={m[
            "tools.openapiToTypescriptConverter.typescriptDescription"
          ]()}
          language="typescript"
          copyLabel={m["tools.openapiToTypescriptConverter.copyTypesLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          maxHeightClassName="h-[16em]"
          className="h-full"
          codeClassName="text-xs"
          actions={
            downloadUrl ? (
              <a
                href={downloadUrl}
                download="openapi-types.d.ts"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.openapiToTypescriptConverter.downloadTypesLabel"]()}
              </a>
            ) : (
              <Button type="button" size="sm" variant="primary" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["tools.openapiToTypescriptConverter.downloadTypesLabel"]()}
              </Button>
            )
          }
          statusContent={
            busy ? (
              <ResultSkeleton
                label={m[
                  "tools.openapiToTypescriptConverter.typescriptLabel"
                ]()}
              />
            ) : errorMessage ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>{errorMessage.title}</Alert.Title>
                  <Alert.Description>
                    <p>{errorMessage.description}</p>
                    {error?.code === "external_ref" && error.refs.length ? (
                      <ul className="mt-2 ml-4 list-disc font-mono text-xs">
                        {error.refs.map((refValue) => (
                          <li key={refValue}>{refValue}</li>
                        ))}
                      </ul>
                    ) : null}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : output ? undefined : (
              <div className="flex min-h-[16em] flex-col items-center justify-center gap-3 bg-default/20 p-6 text-center">
                <FileCode2 aria-hidden className="size-6 text-muted" />
                <p className="max-w-md text-sm text-muted">
                  {m[
                    "tools.openapiToTypescriptConverter.typescriptEmptyDescription"
                  ]()}
                </p>
              </div>
            )
          }
        />
      </div>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["tools.openapiToTypescriptConverter.optionsLabel"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.openapiToTypescriptConverter.optionsDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(OPTION_LABELS) as (keyof typeof OPTION_LABELS)[]).map(
              (key) => (
                <div
                  key={key}
                  className="flex min-h-11 items-center rounded-xl border border-border px-3"
                >
                  <Checkbox
                    isSelected={options[key]}
                    onChange={(value) => {
                      abortPendingWork();
                      setForceVersion(0);
                      setOptions((current) => ({
                        ...current,
                        [key]: value === true,
                      }));
                    }}
                  >
                    <Checkbox.Content className="flex min-h-11 items-center gap-3 text-sm">
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span>{OPTION_LABELS[key]()}</span>
                    </Checkbox.Content>
                  </Checkbox>
                </div>
              ),
            )}
          </div>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.openapiToTypescriptConverter.articleWhatTitle"]()}</h2>
        <p>{m["tools.openapiToTypescriptConverter.articleWhatBody"]()}</p>
        <h2>{m["tools.cronExpressionParser.article.useTitle"]()}</h2>
        <p>{m["tools.openapiToTypescriptConverter.articleWhenBody"]()}</p>
        <h2>{m["tools.openapiToTypescriptConverter.articleBeforeTitle"]()}</h2>
        <p>{m["tools.openapiToTypescriptConverter.articleBeforeBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function OpenapiToTypescriptConverter() {
  return (
    <ToolPage>
      <OpenapiToTypescriptConverterContent />
    </ToolPage>
  );
}
