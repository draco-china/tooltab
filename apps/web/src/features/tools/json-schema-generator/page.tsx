import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Label,
  ListBox,
  Select,
  Skeleton,
  Switch,
} from "@heroui/react";
import { Download, FileJson2 } from "lucide-react";
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
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { getLocale } from "@/paraglide/runtime.js";
import {
  MAX_SCHEMA_INPUT,
  type SchemaOptions,
  SchemaToolError,
  schemaDefaults,
} from "@workspace/tools/json/schema-contract";
import type { SchemaResult } from "@/features/tools/json-schema-tools/jobs";
import { runSchemaWorker } from "../json-schema-tools/worker-client";

const SAMPLE_JSON = `{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "age": 36,
  "active": true,
  "website": "https://example.com",
  "tags": ["math", "poetry"],
  "address": {
    "street": "123 Main St",
    "city": "London",
    "postalCode": "SW1A 1AA"
  },
  "projects": [
    { "name": "Analytical Engine", "year": 1843 },
    { "name": "Notes", "year": 1842, "url": "https://example.com/notes" }
  ],
  "lastSeen": "2024-01-20T10:12:30Z",
  "metadata": null
}`;

const ARTICLE_INPUT = `{
  "id": "bk-101",
  "title": "In-browser Tools",
  "price": 19.99,
  "tags": ["json", "schema"],
  "published": true
}`;

const ARTICLE_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "price": { "type": "number" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "published": { "type": "boolean" }
  },
  "required": ["id", "title", "price", "tags", "published"]
}`;

type Evaluation =
  | { state: "empty" }
  | { state: "loading" }
  | { state: "error"; detail: string }
  | { state: "ready"; result: SchemaResult };

function JsonSchemaGeneratorPageContent() {
  const locale = getLocale();
  const inputId = useId();
  const reader = useRef<FileReader | null>(null);
  const task = useRef<AbortController | null>(null);
  const fileRevision = useRef(0);
  const [input, setInput] = useState(SAMPLE_JSON);
  const [options, setOptions] = useState<SchemaOptions>(schemaDefaults);
  const [evaluation, setEvaluation] = useState<Evaluation>({
    state: "loading",
  });
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredInput = useDeferredValue(input);
  const deferredOptions = useDeferredValue(options);

  function abortActive() {
    task.current?.abort();
    task.current = null;
    reader.current?.abort();
    reader.current = null;
    fileRevision.current += 1;
  }

  function updateInput(value: string) {
    abortActive();
    setInput(value);
  }

  function updateOptions(next: SchemaOptions) {
    task.current?.abort();
    task.current = null;
    setOptions(next);
  }

  useEffect(() => {
    task.current?.abort();
    task.current = null;
    if (!deferredInput.trim()) {
      setEvaluation({ state: "empty" });
      return;
    }
    const controller = new AbortController();
    task.current = controller;
    setEvaluation({ state: "loading" });
    void (async () =>
      runSchemaWorker(
        { kind: "generate", input: deferredInput, options: deferredOptions },
        controller.signal,
      ))()
      .then((result) => {
        if (!controller.signal.aborted && task.current === controller) {
          setEvaluation({ state: "ready", result });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || task.current !== controller) return;
        setEvaluation({
          state: "error",
          detail:
            error instanceof SchemaToolError ? error.code : "invalid_json",
        });
      })
      .finally(() => {
        if (task.current === controller) task.current = null;
      });
    return () => controller.abort();
  }, [deferredInput, deferredOptions]);

  useEffect(() => {
    if (evaluation.state !== "ready") {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([evaluation.result.output], {
        type: "application/json;charset=utf-8",
      }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [evaluation]);

  useEffect(
    () => () => {
      task.current?.abort();
      task.current = null;
      reader.current?.abort();
      reader.current = null;
      fileRevision.current += 1;
    },
    [],
  );

  function importFile(file: File | undefined) {
    if (!file) return;
    abortActive();
    const revision = fileRevision.current;
    if (file.size > MAX_SCHEMA_INPUT) {
      setEvaluation({ state: "error", detail: "too_large" });
      return;
    }
    const current = new FileReader();
    reader.current = current;
    setEvaluation({ state: "loading" });
    current.onload = () => {
      if (reader.current !== current || fileRevision.current !== revision)
        return;
      reader.current = null;
      try {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(
          current.result as ArrayBuffer,
        );
        startTransition(() => setInput(value));
      } catch {
        setEvaluation({ state: "error", detail: "read_failed" });
      }
    };
    current.onerror = () => {
      if (reader.current !== current || fileRevision.current !== revision)
        return;
      reader.current = null;
      setEvaluation({ state: "error", detail: "read_failed" });
    };
    current.onabort = () => {
      if (reader.current === current) reader.current = null;
    };
    current.readAsArrayBuffer(file);
  }

  const errorDetail = evaluation.state === "error" ? evaluation.detail : "";

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <ToolPanelCard className="xl:h-[min(80vh,44rem)]">
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.jsonSchemaGenerator.inputTitle"]({}, { locale })}
              </Card.Title>
              <Card.Description>
                {m["tools.jsonSchemaGenerator.inputDescription"](
                  {},
                  { locale },
                )}
              </Card.Description>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPress={() => {
                abortActive();
                startTransition(() => setInput(SAMPLE_JSON));
              }}
            >
              <FileJson2 aria-hidden className="size-4" />
              {m["common.curlSample"]({}, { locale })}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-3 py-4">
            <Label htmlFor={inputId} className="sr-only">
              {m["tools.jsonSchemaGenerator.inputTitle"]({}, { locale })}
            </Label>
            <CodeEditor
              aria-label={m["tools.jsonSchemaGenerator.inputTitle"](
                {},
                { locale },
              )}
              aria-invalid={Boolean(errorDetail)}
              aria-describedby={errorDetail ? `${inputId}-error` : undefined}
              language="json"
              modelPath="tooltab://json-schema-generator/input.json"
              height={480}
              value={input.slice(0, 100000)}
              readOnly={input.length > 100000}
              onChange={updateInput}
            />
            {errorDetail ? (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="text-sm text-danger"
              >
                {errorDetail}
              </p>
            ) : null}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]({}, { locale })}
              accept={[".json", ".txt", "application/json", "text/plain"]}
              onSelect={importFile}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <CodeBlock
          code={evaluation.state === "ready" ? evaluation.result.output : ""}
          previewCode={
            evaluation.state === "ready"
              ? evaluation.result.output.slice(0, 100000)
              : undefined
          }
          title={m["tools.jsonSchemaGenerator.outputTitle"]({}, { locale })}
          description={m["tools.jsonSchemaGenerator.outputDescription"](
            {},
            { locale },
          )}
          language="json"
          copyLabel={m["tools.jsonSchemaGenerator.copySchemaLabel"](
            {},
            { locale },
          )}
          copiedLabel={m["common.actions.copied"]({}, { locale })}
          maxHeightClassName="min-h-80 max-h-[36rem]"
          statusContent={
            evaluation.state === "loading" ? (
              <OutputSkeleton
                label={m["tools.jsonSchemaGenerator.outputTitle"](
                  {},
                  { locale },
                )}
              />
            ) : evaluation.state === "error" ? (
              <div
                role="alert"
                className="grid min-h-80 place-items-center px-6 text-center"
              >
                <div className="grid gap-2">
                  <strong className="font-medium text-danger">
                    {m["tools.jmespathTester.invalidJsonLabel"]({}, { locale })}
                  </strong>
                  <span className="text-sm break-all text-danger">
                    {errorDetail}
                  </span>
                </div>
              </div>
            ) : evaluation.state === "empty" ? (
              <div className="grid min-h-80 place-items-center px-6 text-center text-sm text-muted">
                {m["tools.jsonSchemaGenerator.outputEmpty"]({}, { locale })}
              </div>
            ) : undefined
          }
          actions={
            downloadUrl ? (
              <a
                href={downloadUrl}
                download="schema.json"
                className={buttonVariants({ size: "sm" })}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.jsonSchemaGenerator.downloadSchemaLabel"](
                  {},
                  { locale },
                )}
              </a>
            ) : (
              <Button type="button" size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["tools.jsonSchemaGenerator.downloadSchemaLabel"](
                  {},
                  { locale },
                )}
              </Button>
            )
          }
        />
      </div>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["shared.aesTools.encryptoptionscardtitle"]({}, { locale })}
          </Card.Title>
        </Card.Header>
        <ToolPanelCardContent className="grid gap-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(14rem,18rem)_repeat(3,minmax(0,1fr))]">
          <Select
            variant="secondary"
            selectedKey={options.draft}
            onSelectionChange={(value) => {
              if (value == null) return;
              updateOptions({
                ...options,
                draft: String(value) as SchemaOptions["draft"],
              });
            }}
          >
            <Label>{m["shared.jsonSchemaTools.draft"]({}, { locale })}</Label>
            <Select.Trigger className="min-h-11 w-full">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox
                aria-label={m["shared.jsonSchemaTools.draft"]({}, { locale })}
              >
                <ListBox.Item id="2020-12" textValue="2020-12">
                  2020-12
                </ListBox.Item>
                <ListBox.Item id="2019-09" textValue="2019-09">
                  2019-09
                </ListBox.Item>
                <ListBox.Item id="draft-07" textValue="Draft-07">
                  Draft-07
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          <OptionSwitch
            label={m["tools.jsonSchemaGenerator.optionInferRequired"](
              {},
              { locale },
            )}
            selected={options.inferRequired}
            onChange={(inferRequired) =>
              updateOptions({ ...options, inferRequired })
            }
          />
          <OptionSwitch
            label={m["common.projectoptionadditionalproperties"](
              {},
              { locale },
            )}
            selected={options.allowAdditionalProperties}
            onChange={(allowAdditionalProperties) =>
              updateOptions({ ...options, allowAdditionalProperties })
            }
          />
          <OptionSwitch
            label={m["tools.jsonSchemaGenerator.optionDetectFormat"](
              {},
              { locale },
            )}
            selected={options.detectFormat}
            onChange={(detectFormat) =>
              updateOptions({ ...options, detectFormat })
            }
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>
          {m["tools.jsonSchemaGenerator.articleWhatTitle"]({}, { locale })}
        </h2>
        <p>{m["tools.jsonSchemaGenerator.articleWhatBody"]({}, { locale })}</p>
        <h3>
          {m["tools.jsonSchemaGenerator.articleDoesTitle"]({}, { locale })}
        </h3>
        <p>{m["tools.jsonSchemaGenerator.articleDoesBody"]({}, { locale })}</p>
        <h3>{m["shared.jsonQuery.example"]({}, { locale })}</h3>
        <p>
          {m["tools.jsonSchemaGenerator.articleExampleBody"]({}, { locale })}
        </p>
        <p>
          <strong>
            {m["tools.jsonSchemaGenerator.articleExampleInputLabel"](
              {},
              { locale },
            )}
          </strong>
        </p>
        <pre>
          <code>{ARTICLE_INPUT}</code>
        </pre>
        <p>
          <strong>
            {m["tools.jsonSchemaGenerator.articleGeneratedSchemaLabel"](
              {},
              { locale },
            )}
          </strong>
        </p>
        <pre>
          <code>{ARTICLE_SCHEMA}</code>
        </pre>
        <h3>
          {m["tools.jsonSchemaGenerator.articleTipsTitle"]({}, { locale })}
        </h3>
        <ul>
          {[
            m["tools.jsonSchemaGenerator.articleTips0"]({}, { locale }),
            m["tools.jsonSchemaGenerator.articleTips1"]({}, { locale }),
            m["tools.jsonSchemaGenerator.articleTips2"]({}, { locale }),
            m["tools.jsonSchemaGenerator.articleTips3"]({}, { locale }),
          ].map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export function JsonSchemaGeneratorPage() {
  return (
    <ToolPage>
      <JsonSchemaGeneratorPageContent />
    </ToolPage>
  );
}

function OptionSwitch({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      isSelected={selected}
      onChange={(value) => onChange(value === true)}
    >
      <Switch.Content className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-80 content-start gap-3 rounded-xl border border-border p-4"
    >
      <Skeleton className="h-5 w-44 rounded-lg" />
      <Skeleton className="h-4 w-full rounded-lg" />
      <Skeleton className="h-4 w-5/6 rounded-lg" />
      <Skeleton className="h-4 w-3/4 rounded-lg" />
    </div>
  );
}
