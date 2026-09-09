import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  Header,
  ListBox,
  SearchField,
  Skeleton,
  useFilter,
} from "@heroui/react";
import {
  Download,
  FileCode2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
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
  type CurlTarget,
  TARGETS,
} from "@workspace/tools/network/curl-contract";
import {
  CurlToolError,
  MAX_CURL_INPUT,
} from "@workspace/tools/network/curl-contract";
import { useTask } from "./ui";

const GROUPS = Array.from(new Set(TARGETS.map((target) => target[2])));
const INPUT_KEY = "tools:curl-converter:input";
const TARGET_KEY = "tools:curl-converter:target";

function Highlighted({ html }: { html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the local worker escapes source before adding static highlight spans.
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function groupLabel(group: string) {
  return group === "command"
    ? "Command line"
    : group === "data"
      ? "Data formats"
      : group === "other"
        ? "Other languages"
        : group;
}

function CurlConverterContent() {
  const task = useTask();
  const [input, setInput] = useState(CURL_SAMPLE);
  const [target, setTarget] = useState<CurlTarget>("javascript-fetch");
  const [hydrated, setHydrated] = useState(false);
  const deferredInput = useDeferredValue(input);
  const id = useId();
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = TARGETS.find(([key]) => key === target);

  useEffect(() => {
    try {
      localStorage.removeItem(INPUT_KEY);
      const storedTarget = localStorage.getItem(TARGET_KEY);
      if (TARGETS.some(([key]) => key === storedTarget))
        setTarget(storedTarget as CurlTarget);
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(TARGET_KEY, target);
    } catch {}
  }, [hydrated, target]);

  const convert = useEffectEvent((value: string, outputTarget: CurlTarget) => {
    if (!value.trim()) {
      task.clear();
      return;
    }
    void task.run({ input: value, target: outputTarget });
  });
  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(
      () => convert(deferredInput, target),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [deferredInput, hydrated, target]);

  async function importFile(file: File) {
    task.clear();
    try {
      if (file.size > MAX_CURL_INPUT) throw new CurlToolError("too_large");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setInput(value);
    } catch (error) {
      task.setError(
        error instanceof CurlToolError
          ? m["tools.curlConverter.errorTooLarge"]()
          : error instanceof TypeError
            ? m["tools.curlConverter.errorInvalidUnicode"]()
            : m["tools.curlConverter.errorFileFailed"](),
      );
    }
  }

  function download() {
    if (!task.result?.output) return;
    const url = URL.createObjectURL(
      new Blob([task.result.output], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = task.result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["tools.curlConverter.targetLanguageLabel"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.curlConverter.description"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <Autocomplete
            id={`${id}-target`}
            selectedKey={target}
            aria-label={m["tools.curlConverter.targetLanguageLabel"]()}
            onSelectionChange={(value) => {
              if (value && TARGETS.some(([key]) => key === String(value))) {
                task.clear();
                setTarget(String(value) as CurlTarget);
              }
            }}
            fullWidth
          >
            <Autocomplete.Trigger className="min-h-11 w-full sm:max-w-sm">
              <Autocomplete.Value />
              <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover className="max-h-80">
              <Autocomplete.Filter filter={contains}>
                <SearchField
                  aria-label={m["tools.curlConverter.targetLanguageLabel"]()}
                >
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input
                      placeholder={m[
                        "tools.curlConverter.languagePlaceholder"
                      ]()}
                    />
                  </SearchField.Group>
                </SearchField>
                <ListBox className="max-h-64 overflow-y-auto">
                  {GROUPS.map((group) => (
                    <ListBox.Section key={group}>
                      <Header className="px-2 py-1 text-xs font-medium text-muted">
                        {groupLabel(group)}
                      </Header>
                      {TARGETS.filter(
                        (targetOption) => targetOption[2] === group,
                      ).map((targetOption) => (
                        <ListBox.Item
                          key={targetOption[0]}
                          id={targetOption[0]}
                          textValue={targetOption[1]}
                        >
                          {targetOption[1]}
                        </ListBox.Item>
                      ))}
                    </ListBox.Section>
                  ))}
                </ListBox>
              </Autocomplete.Filter>
            </Autocomplete.Popover>
          </Autocomplete>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.curlConverter.inputCurlLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.curlConverter.curlPlaceholder"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => {
                  task.clear();
                  setInput(CURL_SAMPLE);
                }}
              >
                <Sparkles aria-hidden className="size-4" />
                {m["common.curlSample"]()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={!input}
                onPress={() => {
                  task.clear();
                  setInput("");
                }}
              >
                <Trash2 aria-hidden className="size-4" />
                {m["common.curlClear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <CodeEditor
              aria-label={m["tools.curlConverter.inputCurlLabel"]()}
              language="shell"
              modelPath="tooltab://curl/source.sh"
              value={input}
              height={320}
              onChange={(value) => {
                task.clear();
                setInput(value);
              }}
            />
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[".txt", ".sh", ".curl", "text/plain"]}
              description={m["tools.curlConverter.importHint"]()}
              onSelect={(file) => void importFile(file)}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.curlConverter.outputCodeLabel"]()}
            </Card.Title>
            <Card.Description>
              {selected?.[1] ?? m["tools.curlConverter.languagePlaceholder"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-busy={task.busy}>
            {task.busy ? (
              <div
                className="grid min-h-80 content-center gap-3"
                role="status"
                aria-label={m["tools.curlConverter.outputCodeLabel"]()}
              >
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : task.error || task.result?.error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.curlConverter.errorsTitle"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {task.error || task.result?.error}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : task.result?.output ? (
              <>
                {task.result.warnings.length ? (
                  <Alert status="warning">
                    <Alert.Indicator>
                      <TriangleAlert aria-hidden className="size-4" />
                    </Alert.Indicator>
                    <Alert.Content>
                      <Alert.Title>
                        {m["tools.certificatePublicKeyParser.warningsTitle"]()}
                      </Alert.Title>
                      <Alert.Description>
                        <ul className="grid gap-1">
                          {task.result.warnings.map((warning) => (
                            <li
                              key={`${warning.code}:${warning.message}`}
                              className="font-mono text-xs wrap-break-word"
                            >
                              [{warning.code}] {warning.message}
                            </li>
                          ))}
                        </ul>
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                <CodeBlock
                  code={task.result.output}
                  title={m["tools.curlConverter.outputCodeLabel"]()}
                  language={selected?.[4]}
                  copyLabel={m["common.actions.copyResult"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  maxHeightClassName="h-[min(32rem,60vh)]"
                  codeClassName="[&_.hljs-keyword]:text-primary [&_.hljs-string]:text-success [&_.hljs-comment]:text-muted"
                  actions={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      isDisabled={!task.result?.output}
                      onPress={download}
                    >
                      <Download aria-hidden className="size-4" />
                      {m["common.actions.download"]()}
                    </Button>
                  }
                >
                  <Highlighted html={task.result.highlighted} />
                </CodeBlock>
                {task.result.previewTruncated ? (
                  <p className="text-sm text-muted">
                    {m["tools.curlConverter.previewTruncated"]()}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-default/20 p-6 text-center">
                <FileCode2 aria-hidden className="size-6 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium">
                    {m["tools.curlConverter.emptyTitle"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {m["tools.curlConverter.emptyDescription"]()}
                  </p>
                </div>
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.curlConverter.whatTitle"]()}</h2>
        <p>{m["tools.curlConverter.whatBody"]()}</p>
        <p>
          <strong>{m["tools.curlConverter.creditTitle"]()}</strong>
          <br />
          {m["tools.curlConverter.creditBody"]()}
        </p>
        <h2>{m["tools.curlConverter.usefulTitle"]()}</h2>
        <ul>
          {(
            [
              m["tools.curlConverter.usefulItems0"](),
              m["tools.curlConverter.usefulItems1"](),
              m["tools.curlConverter.usefulItems2"](),
            ] as const
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.curlConverter.reviewTitle"]()}</h2>
        <ul>
          {(
            [
              m["tools.curlConverter.reviewItems0"](),
              m["tools.curlConverter.reviewItems1"](),
              m["tools.curlConverter.reviewItems2"](),
            ] as const
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function CurlConverter() {
  return (
    <ToolPage>
      <CurlConverterContent />
    </ToolPage>
  );
}

const CURL_SAMPLE = `curl -X POST 'https://api.example.com/v1/messages' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer synthetic-example-token' \\\n  --data-raw '{"message":"Hello"}'`;
