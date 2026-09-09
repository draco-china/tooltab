import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  ListBox,
  Select,
  Skeleton,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, RefreshCcw, Sparkles, TriangleAlert } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  JoseToolError,
  MAX_JOSE_INPUT,
  utf8,
} from "@workspace/tools/crypto/jose-common";
import { listJwks } from "@workspace/tools/crypto/pem";
import { runJose } from "../jose-tools/worker-client";

const DEFAULT_JWK_INPUT = `{
  "crv": "Ed25519",
  "d": "IPR8baukbPNU-nM57_prOTFvP9b9QTXY6JYLO1mbWR4",
  "x": "cc2GnZtI8l9tvVNwDyRRebvDto9_DLG9_Zvm4XODEKE",
  "kty": "OKP"
}`;
const DEFAULT_PEM_INPUT = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEICD0fG2rpGzzVPpzOe/6azkxbz/W/UE12OiWCztZm1ke
-----END PRIVATE KEY-----`;

type Mode = "jwk" | "pem";
type OutputType = "public" | "private";
type Conversion =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; output: string; warnings: string[] }
  | { state: "error"; code: string };

function JwkPemToolContent() {
  const errorId = useId();
  const controllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const revisionRef = useRef(0);
  const [mode, setMode] = useState<Mode>("jwk");
  const [jwkInput, setJwkInput] = useState(DEFAULT_JWK_INPUT);
  const [pemInput, setPemInput] = useState(DEFAULT_PEM_INPUT);
  const [selectedJwkIndex, setSelectedJwkIndex] = useState(0);
  const [outputType, setOutputType] = useState<OutputType>("private");
  const [prettyJson, setPrettyJson] = useState(true);
  const [conversionVersion, setConversionVersion] = useState(0);
  const [conversion, setConversion] = useState<Conversion>({
    state: "loading",
  });
  const activeInput = mode === "jwk" ? jwkInput : pemInput;
  const deferredInput = useDeferredValue(activeInput);
  const jwkKeys = useMemo(() => {
    try {
      return listJwks(jwkInput);
    } catch {
      return [];
    }
  }, [jwkInput]);

  function invalidate() {
    revisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    releaseReader(readerRef, true);
  }

  useEffect(() => {
    if (selectedJwkIndex >= jwkKeys.length) setSelectedJwkIndex(0);
  }, [jwkKeys.length, selectedJwkIndex]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: importing identical key text must still start a fresh, current conversion
  useEffect(() => {
    if (deferredInput !== activeInput) {
      setConversion({ state: "loading" });
      return;
    }
    if (!deferredInput.trim()) {
      setConversion({ state: "idle" });
      return;
    }
    const revision = ++revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setConversion({ state: "loading" });
    const job =
      mode === "jwk"
        ? {
            mode: "jwkToPem" as const,
            input: deferredInput,
            index: selectedJwkIndex,
            outputType,
          }
        : {
            mode: "pemToJwk" as const,
            input: deferredInput,
            pretty: prettyJson,
          };
    void runJose(job, controller.signal)
      .then((result) => {
        if (
          revision !== revisionRef.current ||
          controllerRef.current !== controller ||
          controller.signal.aborted ||
          !("output" in result)
        )
          return;
        setConversion({
          state: "ready",
          output: result.output,
          warnings: result.warnings,
        });
      })
      .catch((error) => {
        if (
          revision !== revisionRef.current ||
          controllerRef.current !== controller ||
          controller.signal.aborted
        )
          return;
        setConversion({
          state: "error",
          code:
            error instanceof JoseToolError ? error.code : "operation_failed",
        });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [
    activeInput,
    conversionVersion,
    deferredInput,
    mode,
    outputType,
    prettyJson,
    selectedJwkIndex,
  ]);

  useEffect(
    () => () => {
      revisionRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      releaseReader(readerRef, true);
    },
    [],
  );

  function changeInput(value: string) {
    invalidate();
    if (mode === "jwk") {
      setJwkInput(value);
      setSelectedJwkIndex(0);
    } else setPemInput(value);
    setConversion(value.trim() ? { state: "loading" } : { state: "idle" });
  }

  function changeMode(next: Mode) {
    if (next === mode) return;
    invalidate();
    setMode(next);
    setConversion({ state: "loading" });
  }

  function useSample() {
    invalidate();
    startTransition(() => {
      if (mode === "jwk") {
        setJwkInput(DEFAULT_JWK_INPUT);
        setSelectedJwkIndex(0);
      } else setPemInput(DEFAULT_PEM_INPUT);
      setConversionVersion((value) => value + 1);
      setConversion({ state: "loading" });
    });
  }

  function clearInput() {
    invalidate();
    startTransition(() => {
      if (mode === "jwk") {
        setJwkInput("");
        setSelectedJwkIndex(0);
      } else setPemInput("");
      setConversion({ state: "idle" });
    });
  }

  function importFile(file: File) {
    invalidate();
    if (file.size > MAX_JOSE_INPUT) {
      setConversion({ state: "error", code: "too_large" });
      return;
    }
    const revision = revisionRef.current;
    try {
      const reader = new FileReader();
      readerRef.current = reader;
      setConversion({ state: "loading" });
      reader.onload = () => {
        const result = reader.result;
        if (
          readerRef.current !== reader ||
          revisionRef.current !== revision ||
          !(result instanceof ArrayBuffer)
        )
          return;
        releaseReader(readerRef, false);
        try {
          const value = utf8(new Uint8Array(result));
          startTransition(() => {
            if (mode === "jwk") {
              setJwkInput(value);
              setSelectedJwkIndex(0);
            } else setPemInput(value);
            setConversionVersion((current) => current + 1);
          });
        } catch {
          setConversion({ state: "error", code: "invalid_unicode" });
        }
      };
      reader.onerror = () => {
        if (readerRef.current !== reader || revisionRef.current !== revision)
          return;
        releaseReader(readerRef, false);
        setConversion({ state: "error", code: "file_failed" });
      };
      reader.onabort = () => {
        if (readerRef.current === reader) releaseReader(readerRef, false);
      };
      reader.readAsArrayBuffer(file);
    } catch {
      releaseReader(readerRef, false);
      if (revisionRef.current === revision)
        setConversion({ state: "error", code: "file_failed" });
    }
  }

  function download() {
    if (conversion.state !== "ready") return;
    let url = "";
    try {
      url = URL.createObjectURL(
        new Blob([conversion.output], {
          type:
            mode === "jwk"
              ? "application/x-pem-file;charset=utf-8"
              : "application/json;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        mode === "jwk"
          ? outputType === "public"
            ? "public-key.pem"
            : "private-key.pem"
          : conversion.output.includes('"keys"')
            ? "jwks.json"
            : "key.jwk.json";
      anchor.click();
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  const isPending =
    deferredInput !== activeInput || conversion.state === "loading";
  const inputError = conversion.state === "error";
  const error = inputError
    ? errorMessage(conversion.code, mode, outputType)
    : "";
  const warnings =
    conversion.state === "ready"
      ? conversion.warnings.map((code) => warningMessage(code))
      : [];

  return (
    <div className="grid min-w-0 gap-6">
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={new Set([mode])}
        aria-label={m["common.jwkConverterName"]()}
        className="grid w-full grid-cols-2 [&_button]:min-h-11 [&_button]:w-full"
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (next === "jwk" || next === "pem") changeMode(next);
        }}
      >
        <ToggleButton id="jwk">{m["shared.joseTools.jwkToPem"]()}</ToggleButton>
        <ToggleButton id="pem">{m["shared.joseTools.pemToJwk"]()}</ToggleButton>
      </ToggleButtonGroup>

      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <Card.Title>
              {mode === "jwk"
                ? m["tools.jwkPemConverter.jwkInputTitle"]()
                : m["tools.jwkPemConverter.pemInputTitle"]()}
            </Card.Title>
            <Card.Description>
              {mode === "jwk"
                ? m["tools.jwkPemConverter.jwkInputHint"]()
                : m["tools.jwkPemConverter.pemInputHint"]()}
            </Card.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <Button type="button" size="sm" variant="ghost" onPress={useSample}>
              <Sparkles aria-hidden className="size-4" />
              {m["shared.bcrypt.sample"]()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPress={clearInput}
            >
              <RefreshCcw aria-hidden className="size-4" />
              {m["shared.joseTools.clear"]()}
            </Button>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          <div className="relative">
            <CodeEditor
              aria-label={
                mode === "jwk"
                  ? m["tools.jwkPemConverter.jwkInputTitle"]()
                  : m["tools.jwkPemConverter.pemInputTitle"]()
              }
              aria-describedby={inputError ? errorId : undefined}
              aria-invalid={inputError}
              language={mode === "jwk" ? "json" : "plaintext"}
              modelPath={`tooltab://jwk-pem-converter/input.${mode === "jwk" ? "json" : "pem"}`}
              value={activeInput}
              height={288}
              onChange={changeInput}
            />
            {!activeInput ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
              >
                {mode === "jwk"
                  ? m["tools.jwkPemConverter.jwkInputPlaceholder"]()
                  : m["tools.jwkPemConverter.pemInputPlaceholder"]()}
              </span>
            ) : null}
          </div>

          {mode === "jwk" ? (
            <div className="grid gap-5">
              {jwkKeys.length > 1 ? (
                <>
                  <Select
                    variant="secondary"
                    selectedKey={String(selectedJwkIndex)}
                    onSelectionChange={(key) => {
                      const next = Number(key);
                      if (!Number.isInteger(next)) return;
                      invalidate();
                      setSelectedJwkIndex(next);
                      setConversion({ state: "loading" });
                    }}
                  >
                    <Label>{m["tools.jwkPemConverter.keySelectLabel"]()}</Label>
                    <Select.Trigger className="min-h-11 w-full">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox
                        aria-label={m["tools.jwkPemConverter.keySelectLabel"]()}
                      >
                        {jwkKeys.map((key, index) => {
                          const label = formatKeyLabel(
                            key,
                            index,
                            m["shared.aesTools.encryptkeycardtitle"](),
                          );
                          return (
                            <ListBox.Item
                              id={String(index)}
                              // biome-ignore lint/suspicious/noArrayIndexKey: a JWKS can contain duplicate key material without kid values; the ordered position is its identity
                              key={`${index}-${label}`}
                              textValue={label}
                            >
                              {label}
                            </ListBox.Item>
                          );
                        })}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <p className="text-sm text-muted">
                    {m["tools.jwkPemConverter.keySelectHint"]()}
                  </p>
                </>
              ) : null}
              <div className="grid gap-2">
                <Label>{m["tools.jwkPemConverter.outputTypeLabel"]()}</Label>
                <ToggleButtonGroup
                  selectionMode="single"
                  selectedKeys={new Set([outputType])}
                  aria-label={m["tools.jwkPemConverter.outputTypeLabel"]()}
                  className="grid w-full grid-cols-2 [&_button]:min-h-11 [&_button]:w-full"
                  onSelectionChange={(selection) => {
                    const next = String([...selection][0] ?? "");
                    if (next !== "public" && next !== "private") return;
                    invalidate();
                    setOutputType(next);
                    setConversion({ state: "loading" });
                  }}
                >
                  <ToggleButton id="public">
                    {m["tools.jwkPemConverter.outputTypePublic"]()}
                  </ToggleButton>
                  <ToggleButton id="private">
                    {m["tools.jwkPemConverter.outputTypePrivate"]()}
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
            </div>
          ) : (
            <Switch
              isSelected={prettyJson}
              onChange={(selected) => {
                invalidate();
                setPrettyJson(selected === true);
                setConversion({ state: "loading" });
              }}
            >
              <Switch.Content className="flex min-h-11 items-center gap-3">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span>{m["tools.jwkPemConverter.prettyJson"]()}</span>
              </Switch.Content>
            </Switch>
          )}

          <ToolFilePicker
            label={m["common.adler32importfromfilelabel"]()}
            description={m["tools.jwkPemConverter.localFileDescription"]()}
            accept={
              mode === "jwk"
                ? [".json", ".jwk", ".txt", "application/json", "text/plain"]
                : [
                    ".pem",
                    ".key",
                    ".pub",
                    ".txt",
                    "application/x-pem-file",
                    "text/plain",
                  ]
            }
            onSelect={importFile}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      {error ? (
        <Alert status="danger" role="alert" id={errorId}>
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.jwkPemConverter.conversionErrorTitle"]()}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {warnings.length ? (
        <Alert status="warning" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.certificatePublicKeyParser.warningsTitle"]()}
            </Alert.Title>
            <Alert.Description>
              {warnings.length === 1 ? (
                warnings[0]
              ) : (
                <ul className="ms-4 list-disc space-y-1">
                  {Array.from(new Set(warnings)).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {isPending ? (
        <OutputSkeleton label={m["shared.csvJson.csvBusy"]()} />
      ) : conversion.state === "ready" ? (
        <CodeBlock
          code={conversion.output}
          title={m["shared.joseTools.output"]()}
          description={m["tools.jwkPemConverter.outputDescription"]()}
          language={mode === "jwk" ? "plaintext" : "json"}
          copyLabel={m["common.adler32copyresultlabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          maxHeightClassName="min-h-72 max-h-[36rem]"
          wrap
          actions={
            <Button type="button" size="sm" onPress={download}>
              <Download aria-hidden className="size-4" />
              {m["common.actions.download"]()}
            </Button>
          }
        />
      ) : null}

      <ToolArticle>
        <h2>{m["tools.jwkPemConverter.articleTitle"]()}</h2>
        {[
          m["tools.jwkPemConverter.articleParagraphs0"](),
          m["tools.jwkPemConverter.articleParagraphs1"](),
          m["tools.jwkPemConverter.articleParagraphs2"](),
          m["tools.jwkPemConverter.articleParagraphs3"](),
        ].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <ul>
          {[
            m["tools.jwkPemConverter.articleItems0"](),
            m["tools.jwkPemConverter.articleItems1"](),
            m["tools.jwkPemConverter.articleItems2"](),
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
    <ToolPanelCard aria-busy="true">
      <Card.Header className="border-b border-separator">
        <Skeleton className="h-5 w-28 rounded-lg" />
        <Skeleton className="h-4 w-3/5 rounded-lg" />
      </Card.Header>
      <ToolPanelCardContent
        className="gap-3 py-4"
        role="status"
        aria-label={label}
      >
        <Skeleton className="h-4 w-2/5 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-3/4 rounded-lg" />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function formatKeyLabel(
  key: Record<string, unknown>,
  index: number,
  unknownKey: string,
) {
  const type = typeof key.kty === "string" && key.kty ? key.kty : unknownKey;
  const detail = typeof key.crv === "string" && key.crv ? ` ${key.crv}` : "";
  const keyId =
    typeof key.kid === "string" && key.kid.trim()
      ? ` (${key.kid})`
      : ` #${index + 1}`;
  return `${type}${detail}${keyId}`;
}

function errorMessage(code: string, mode: Mode, outputType: OutputType) {
  switch (code) {
    case "invalid_json":
      return m["tools.jwkPemConverter.errorInvalidJson"]();
    case "missing_key_field":
      return outputType === "private"
        ? m["tools.jwkPemConverter.errorMissingPrivateKey"]()
        : m["tools.jwkPemConverter.errorMissingPublicKey"]();
    case "unsupported_key_type":
      return m["tools.jwkPemConverter.errorUnsupportedKty"]({
        kty: m["shared.aesTools.encryptkeycardtitle"](),
      });
    case "unsupported_curve":
      return m["tools.jwkPemConverter.errorUnsupportedCurve"]({
        crv: m["shared.aesTools.encryptkeycardtitle"](),
      });
    case "invalid_pem":
      return m["tools.jwkPemConverter.errorInvalidPem"]();
    case "unsupported_pem":
      return m["tools.jwkPemConverter.errorUnsupportedPemLabel"]();
    case "public_key_missing":
      return m["tools.jwkPemConverter.errorOkpPublicKeyMissing"]();
    case "too_large":
      return m["tools.jwkPemConverter.localTooLargeError"]();
    case "too_deep":
      return m["tools.jwkPemConverter.localTooDeepError"]();
    case "invalid_unicode":
      return m["tools.jwkPemConverter.localInvalidUnicodeError"]();
    case "file_failed":
      return m["tools.jwkPemConverter.localReadError"]();
    case "worker_failed":
      return m["tools.jwkPemConverter.localWorkerError"]();
    case "timeout":
      return m["tools.jwkPemConverter.localTimeoutError"]();
    case "invalid_base64":
    case "invalid_key":
    case "object_required":
      return mode === "jwk"
        ? m["tools.jwkPemConverter.errorInvalidJwk"]()
        : m["tools.jwkPemConverter.errorInvalidPem"]();
    default:
      return m["tools.jwkPemConverter.localGenericError"]();
  }
}

function warningMessage(code: string) {
  switch (code) {
    case "unsupported_pem":
      return m["tools.jwkPemConverter.errorUnsupportedPemLabel"]();
    case "public_key_missing":
      return m["tools.jwkPemConverter.errorOkpPublicKeyMissing"]();
    case "unrecognized_text":
      return m["tools.jwkPemConverter.localUnrecognizedTextWarning"]();
    case "unsupported_curve":
      return m["tools.jwkPemConverter.errorUnsupportedCurve"]({
        crv: m["shared.aesTools.encryptkeycardtitle"](),
      });
    default:
      return m["tools.jwkPemConverter.errorInvalidPem"]();
  }
}

function releaseReader(ref: { current: FileReader | null }, abort: boolean) {
  const reader = ref.current;
  if (!reader) return;
  reader.onload = null;
  reader.onerror = null;
  reader.onabort = null;
  if (abort && reader.readyState === FileReader.LOADING) reader.abort();
  ref.current = null;
}

export default function JwkPemTool() {
  return (
    <ToolPage>
      <JwkPemToolContent />
    </ToolPage>
  );
}
