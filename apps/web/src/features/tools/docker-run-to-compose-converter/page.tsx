import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Skeleton, TextArea } from "@heroui/react";
import {
  Download,
  FileCode2,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { DeveloperParserError } from "@/features/tools/_shared/developer-parser-error";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { runDocker } from "../developer-parsers/client";
import { dockerDiagnostic } from "../developer-parsers/diagnostics";
import {
  type DockerResult,
  MAX_DOCKER_INPUT,
} from "@workspace/tools/project/docker";

export const DOCKER_SAMPLE = `docker run --name api -p 8080:8080 -e NODE_ENV=production -e API_KEY \\
  -v ./data:/data --restart unless-stopped node:20-alpine node server.js

docker run -d --name redis -p 6379:6379 redis:7-alpine`;

const INPUT_STORAGE_KEY = "tools:docker-run-to-compose-converter:input";
const PREVIEW_LIMIT = 200_000;

function taskError(cause: unknown) {
  const code = cause instanceof DeveloperParserError ? cause.code : "";
  switch (code) {
    case "too_large":
      return m["tools.dockerRunToComposeConverter.statesTooLargeError"]();
    case "invalid_unicode":
      return m["tools.dockerRunToComposeConverter.statesInvalidUnicodeError"]();
    case "timeout":
      return m["tools.dockerRunToComposeConverter.statesTimeoutError"]();
    case "worker_failed":
      return m["tools.dockerRunToComposeConverter.statesWorkerError"]();
    case "output_too_large":
      return m["tools.dockerRunToComposeConverter.statesOutputTooLargeError"]();
    default:
      return m["tools.dockerRunToComposeConverter.statesConversionError"]();
  }
}

function DockerRunToComposePageContent() {
  const [input, setInput] = useState(DOCKER_SAMPLE);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<DockerResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setError("");
    setBusy(false);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(INPUT_STORAGE_KEY);
      if (stored !== null) setInput(stored);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(INPUT_STORAGE_KEY, input);
    } catch {}
  }, [hydrated, input]);

  const convert = useEffectEvent(async (value: string) => {
    if (!value.trim()) {
      invalidate();
      return;
    }
    invalidate();
    const current = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const next = await runDocker(value, abort.signal);
      if (current === revision.current) setResult(next);
    } catch (cause) {
      if (current === revision.current && !abort.signal.aborted)
        setError(taskError(cause));
    } finally {
      if (current === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation deliberately retries an unchanged sample or imported file.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => void convert(input), 250);
    return () => window.clearTimeout(timer);
  }, [generation, hydrated, input]);

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
    },
    [],
  );

  const output = result?.output ?? "";
  useEffect(() => {
    if (!output) {
      setDownloadUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(
      new Blob([output], { type: "text/yaml;charset=utf-8" }),
    );
    setDownloadUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [output]);

  function updateInput(value: string) {
    invalidate();
    if (value === input) setGeneration((current) => current + 1);
    else setInput(value);
  }

  async function importFile(file: File) {
    invalidate();
    const current = revision.current;
    setFileName(file.name);
    try {
      if (file.size > MAX_DOCKER_INPUT)
        throw new DeveloperParserError("too_large");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (current === revision.current) updateInput(value);
    } catch (cause) {
      if (current === revision.current)
        setError(
          cause instanceof TypeError
            ? m["tools.dockerRunToComposeConverter.statesInvalidUnicodeError"]()
            : taskError(cause),
        );
    }
  }

  const resultError = result?.error ? dockerDiagnostic(result.error) : "";
  const warnings = result?.warnings.map(dockerDiagnostic) ?? [];

  return (
    <div className="grid gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.dockerRunToComposeConverter.runLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.dockerRunToComposeConverter.runDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setFileName("");
                  updateInput(DOCKER_SAMPLE);
                }}
              >
                <Sparkles aria-hidden className="size-4" />
                {m["common.curlSample"]()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setFileName("");
                  updateInput("");
                }}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.curlClear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              aria-label={m["tools.dockerRunToComposeConverter.runLabel"]()}
              aria-invalid={Boolean(error || resultError)}
              spellCheck={false}
              autoComplete="off"
              rows={14}
              value={input}
              placeholder={m[
                "tools.dockerRunToComposeConverter.runPlaceholder"
              ]()}
              className="min-h-80 flex-1 resize-y font-mono text-sm"
              onChange={(event) => {
                setFileName("");
                updateInput(event.currentTarget.value);
              }}
            />
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[".txt", ".sh", "text/plain", "application/x-sh"]}
              fileName={fileName}
              onSelect={(file) => void importFile(file)}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.dockerRunToComposeConverter.composeLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.dockerRunToComposeConverter.composeDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-busy={busy}>
            {warnings.length ? (
              <Alert status="warning">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.dockerRunToComposeConverter.curlWarnings"]()}
                  </Alert.Title>
                  <Alert.Description>
                    <ul className="ms-4 grid list-disc gap-1">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {busy ? (
              <div
                className="grid min-h-80 content-start gap-3 p-4"
                role="status"
                aria-label={m[
                  "tools.dockerRunToComposeConverter.statesConvertingLabel"
                ]()}
              >
                <span className="sr-only">
                  {m[
                    "tools.dockerRunToComposeConverter.statesConvertingLabel"
                  ]()}
                </span>
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-56 w-full" />
              </div>
            ) : error || resultError ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>{m["common.dockerDiagnostic11"]()}</Alert.Title>
                  <Alert.Description>{error || resultError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : output ? (
              <>
                <CodeBlock
                  code={output}
                  previewCode={output.slice(0, PREVIEW_LIMIT)}
                  title={m["tools.dockerRunToComposeConverter.composeLabel"]()}
                  language="yaml"
                  copyLabel={m[
                    "tools.dockerRunToComposeConverter.copyComposeLabel"
                  ]()}
                  copiedLabel={m["common.actions.copied"]()}
                  maxHeightClassName="min-h-80 max-h-[32rem]"
                  actions={
                    downloadUrl && output ? (
                      <a
                        href={downloadUrl}
                        download="docker-compose.yml"
                        className={buttonVariants({ size: "sm" })}
                      >
                        <Download aria-hidden className="size-4" />
                        {m[
                          "tools.dockerRunToComposeConverter.downloadComposeLabel"
                        ]()}
                      </a>
                    ) : (
                      <Button type="button" size="sm" isDisabled>
                        <Download aria-hidden className="size-4" />
                        {m[
                          "tools.dockerRunToComposeConverter.downloadComposeLabel"
                        ]()}
                      </Button>
                    )
                  }
                />
                {output.length > PREVIEW_LIMIT ? (
                  <p className="text-sm text-muted">
                    {m[
                      "tools.dockerRunToComposeConverter.statesPreviewTruncated"
                    ]()}
                  </p>
                ) : null}
              </>
            ) : (
              <section
                aria-label={m[
                  "tools.dockerRunToComposeConverter.composeLabel"
                ]()}
                className="flex min-h-80 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center"
              >
                <FileCode2 aria-hidden className="size-6 text-muted" />
                <p className="max-w-md text-sm text-muted">
                  {m[
                    "tools.dockerRunToComposeConverter.composeEmptyDescription"
                  ]()}
                </p>
              </section>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.dockerRunToComposeConverter.article.whatTitle"]()}</h2>
        <p>
          {m["tools.dockerRunToComposeConverter.articleWhatBodyStart"]()}
          <code>docker run</code>
          {m["tools.dockerRunToComposeConverter.articleWhatBodyMiddle"]()}
          <code>docker-compose.yml</code>
          {m["tools.dockerRunToComposeConverter.articleWhatBodyEnd"]()}
        </p>
        <h2>{m["tools.dockerRunToComposeConverter.article.whenTitle"]()}</h2>
        <p>{m["tools.dockerRunToComposeConverter.articleWhenBody"]()}</p>
        <h2>{m["tools.dockerRunToComposeConverter.articleExpectTitle"]()}</h2>
        <p>{m["tools.dockerRunToComposeConverter.articleExpectBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function DockerRunToComposePage() {
  return (
    <ToolPage>
      <DockerRunToComposePageContent />
    </ToolPage>
  );
}
