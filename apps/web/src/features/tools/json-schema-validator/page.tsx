import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Skeleton,
  Table,
} from "@heroui/react";
import { BadgeCheck, FileJson2, RefreshCcw, TriangleAlert } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { SchemaToolError } from "@workspace/tools/json/schema-contract";
import type { SchemaResult } from "@/features/tools/json-schema-tools/jobs";
import { runSchemaWorker } from "../json-schema-tools/worker-client";

const DEFAULT_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1 },
    "age": { "type": "integer", "minimum": 0 }
  },
  "required": ["id", "name"],
  "additionalProperties": false
}`;
const DEFAULT_DATA = `{
  "id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  "name": "Ada Lovelace",
  "age": 37
}`;
type Issue = { path: string; keyword: string; message: string };
type Evaluation =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "parse-error"; source: "schema" | "data"; message: string }
  | { state: "schema-error"; message: string; draft: string }
  | { state: "validated"; result: SchemaResult; issues: Issue[] };

function JsonSchemaValidatorPageContent() {
  const locale = getLocale();
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [data, setData] = useState(DEFAULT_DATA);
  const [validateFormats, setValidateFormats] = useState(true);
  const [allErrors, setAllErrors] = useState(true);
  const [evaluation, setEvaluation] = useState<Evaluation>({
    state: "loading",
  });
  const deferredSchema = useDeferredValue(schema);
  const deferredData = useDeferredValue(data);
  const task = useRef<AbortController | null>(null);

  useEffect(() => {
    task.current?.abort();
    task.current = null;
    if (!deferredSchema.trim() || !deferredData.trim()) {
      setEvaluation({ state: "idle" });
      return;
    }
    for (const [source, value] of [
      ["schema", deferredSchema],
      ["data", deferredData],
    ] as const) {
      try {
        JSON.parse(value);
      } catch (error) {
        setEvaluation({
          state: "parse-error",
          source,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }
    const controller = new AbortController();
    task.current = controller;
    setEvaluation({ state: "loading" });
    void (async () =>
      runSchemaWorker(
        {
          kind: "validate",
          input: deferredData,
          schema: deferredSchema,
          allErrors,
          validateFormats,
        },
        controller.signal,
      ))()
      .then((result) => {
        if (controller.signal.aborted) return;
        const output = JSON.parse(result.output) as { issues?: Issue[] };
        setEvaluation({
          state: "validated",
          result,
          issues: Array.isArray(output.issues) ? output.issues : [],
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setEvaluation({
          state: "schema-error",
          message:
            error instanceof SchemaToolError
              ? error.code
              : error instanceof Error
                ? error.message
                : String(error),
          draft: detectDraft(deferredSchema),
        });
      })
      .finally(() => {
        if (task.current === controller) task.current = null;
      });
    return () => controller.abort();
  }, [allErrors, deferredData, deferredSchema, validateFormats]);

  useEffect(
    () => () => {
      task.current?.abort();
      task.current = null;
    },
    [],
  );

  const issues = evaluation.state === "validated" ? evaluation.issues : [];
  const errorsJson = issues.length ? JSON.stringify(issues, null, 2) : "";
  const draft =
    evaluation.state === "validated"
      ? (evaluation.result.draft ?? "2020-12")
      : evaluation.state === "schema-error"
        ? evaluation.draft
        : detectDraft(schema);

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 auto-rows-fr gap-6 md:grid-cols-2">
          <EditorCard
            label={m["tools.jsonSchemaValidator.schemaLabel"]({}, { locale })}
            description={m["tools.jsonSchemaValidator.schemaDescription"](
              {},
              { locale },
            )}
            value={schema}
            modelKey="schema"
            placeholder={m["tools.jsonSchemaValidator.schemaPlaceholder"](
              {},
              { locale },
            )}
            copyLabel={m["tools.jsonSchemaGenerator.copySchemaLabel"](
              {},
              { locale },
            )}
            copiedLabel={m["common.actions.copied"]({}, { locale })}
            invalid={
              evaluation.state === "parse-error" &&
              evaluation.source === "schema"
            }
            onChange={setSchema}
          />
          <EditorCard
            label={m["tools.jsonSchemaValidator.dataLabel"]({}, { locale })}
            description={m["tools.jsonSchemaValidator.dataDescription"](
              {},
              { locale },
            )}
            value={data}
            modelKey="data"
            placeholder={m["tools.jsonSchemaValidator.dataPlaceholder"](
              {},
              { locale },
            )}
            copyLabel={m["tools.jsonSchemaValidator.copyDataLabel"](
              {},
              { locale },
            )}
            copiedLabel={m["common.actions.copied"]({}, { locale })}
            invalid={
              evaluation.state === "parse-error" && evaluation.source === "data"
            }
            onChange={setData}
          />
        </div>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["tools.jsonSchemaValidator.optionsTitle"]({}, { locale })}
            </Card.Title>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  startTransition(() => {
                    setSchema(DEFAULT_SCHEMA);
                    setData(DEFAULT_DATA);
                    setValidateFormats(true);
                    setAllErrors(true);
                  })
                }
              >
                <FileJson2 aria-hidden className="size-4" />
                {m["shared.baseEncoding.sample"]({}, { locale })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  setSchema("");
                  setData("");
                }}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.curlClear"]({}, { locale })}
              </Button>
            </div>
            <Card.Description className="sm:col-span-2">
              {m["tools.jsonSchemaValidator.optionsDescription"](
                {},
                { locale },
              )}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <Option
              checked={validateFormats}
              title={m["tools.jsonSchemaValidator.validateFormatsLabel"](
                {},
                { locale },
              )}
              description={m[
                "tools.jsonSchemaValidator.validateFormatsDescription"
              ]({}, { locale })}
              onChange={setValidateFormats}
            />
            <Option
              checked={allErrors}
              title={m["tools.jsonSchemaValidator.allErrorsLabel"](
                {},
                { locale },
              )}
              description={m["tools.jsonSchemaValidator.allErrorsDescription"](
                {},
                { locale },
              )}
              onChange={setAllErrors}
            />
            <div className="flex items-center gap-2 border-t border-separator pt-4">
              <span className="text-sm font-medium">
                {m["tools.jsonSchemaValidator.draftLabel"]({}, { locale })}
              </span>
              <Chip size="sm" variant="secondary" className="font-mono">
                {draft}
              </Chip>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ResultCard
        locale={locale}
        evaluation={evaluation}
        errorsJson={errorsJson}
      />
      <ToolArticle>
        <h2>
          {m["tools.jsonSchemaValidator.articleAboutTitle"]({}, { locale })}
        </h2>
        <p>{m["tools.jsonSchemaValidator.articleAboutBody"]({}, { locale })}</p>
        <h2>
          {m["tools.jsonSchemaValidator.articleFitsTitle"]({}, { locale })}
        </h2>
        <ul>
          {[
            m["tools.jsonSchemaValidator.articleFitsItems0"]({}, { locale }),
            m["tools.jsonSchemaValidator.articleFitsItems1"]({}, { locale }),
            m["tools.jsonSchemaValidator.articleFitsItems2"]({}, { locale }),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>
          {m["tools.jsonSchemaValidator.articleLimitsTitle"]({}, { locale })}
        </h2>
        <ul>
          {[
            m["tools.jsonSchemaValidator.articleLimitsItems0"]({}, { locale }),
            m["tools.jsonSchemaValidator.articleLimitsItems1"]({}, { locale }),
            m["tools.jsonSchemaValidator.articleLimitsItems2"]({}, { locale }),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function EditorCard({
  label,
  description,
  value,
  modelKey,
  placeholder,
  copyLabel,
  copiedLabel,
  invalid,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  modelKey: "schema" | "data";
  placeholder: string;
  copyLabel: string;
  copiedLabel: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{label}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="relative py-4">
        <CodeEditor
          aria-label={label}
          aria-invalid={invalid}
          language="json"
          modelPath={`tooltab://json-schema-validator/${modelKey}.json`}
          value={value}
          height={256}
          onChange={onChange}
        />
        {!value ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-s-8 top-8 z-10 font-mono text-sm text-muted"
          >
            {placeholder}
          </span>
        ) : null}
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="justify-start">
        <ToolCopyButton
          value={value}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          variant="ghost"
        />
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function Option({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <Checkbox isSelected={checked} onChange={onChange}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content className="grid gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted">{description}</span>
      </Checkbox.Content>
    </Checkbox>
  );
}

function ResultCard({
  locale,
  evaluation,
  errorsJson,
}: {
  locale: ReturnType<typeof getLocale>;
  evaluation: Evaluation;
  errorsJson: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.jsonSchemaValidator.resultTitle"]({}, { locale })}
        </Card.Title>
        <Card.Description>
          {m["tools.jsonSchemaValidator.resultDescription"]({}, { locale })}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {evaluation.state === "loading" ? (
          <div
            role="status"
            className="grid gap-3"
            aria-label={m["tools.jsonSchemaValidator.resultTitle"](
              {},
              { locale },
            )}
          >
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-10 w-4/5 rounded-xl" />
          </div>
        ) : evaluation.state === "idle" ? (
          <StatusAlert
            title={m["tools.jsonSchemaValidator.idleTitle"]({}, { locale })}
            description={m["tools.jsonSchemaValidator.idleDescription"](
              {},
              { locale },
            )}
            icon="file"
          />
        ) : evaluation.state === "parse-error" ? (
          <StatusAlert
            title={m["tools.jsonSchemaValidator.parseErrorTitle"](
              {},
              { locale },
            )}
            description={`${
              evaluation.source === "schema"
                ? m["tools.jsonSchemaValidator.schemaLabel"]({}, { locale })
                : m["tools.jsonSchemaValidator.dataLabel"]({}, { locale })
            }: ${evaluation.message}`}
            danger
          />
        ) : evaluation.state === "schema-error" ? (
          <StatusAlert
            title={m["tools.jsonSchemaValidator.schemaErrorTitle"](
              {},
              { locale },
            )}
            description={evaluation.message}
            danger
          />
        ) : evaluation.result.valid ? (
          <StatusAlert
            title={m["tools.jsonSchemaValidator.validTitle"]({}, { locale })}
            description={m["tools.jsonSchemaValidator.validDescription"](
              {},
              { locale },
            )}
            success
          />
        ) : (
          <>
            <StatusAlert
              title={m["tools.jsonSchemaValidator.invalidTitle"](
                {},
                { locale },
              )}
              description={m["tools.jsonSchemaValidator.invalidDescription"](
                {},
                { locale },
              )}
              danger
            />
            <IssueTable locale={locale} issues={evaluation.issues} />
          </>
        )}
      </ToolPanelCardContent>
      {errorsJson ? (
        <ToolPanelCardFooter className="justify-end">
          <ToolCopyButton
            value={errorsJson}
            copyLabel={m["tools.jsonSchemaValidator.copyErrorsLabel"](
              {},
              { locale },
            )}
            copiedLabel={m["common.actions.copied"]({}, { locale })}
          />
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function IssueTable({
  locale,
  issues,
}: {
  locale: ReturnType<typeof getLocale>;
  issues: Issue[];
}) {
  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label={m["tools.jsonSchemaValidator.resultTitle"](
            {},
            { locale },
          )}
        >
          <Table.Header>
            <Table.Column id="path" isRowHeader>
              {m["tools.jsonSchemaValidator.errorPathLabel"]({}, { locale })}
            </Table.Column>
            <Table.Column id="keyword">
              {m["tools.jsonSchemaValidator.errorKeywordLabel"]({}, { locale })}
            </Table.Column>
            <Table.Column id="message">
              {m["tools.jsonSchemaValidator.errorMessageLabel"]({}, { locale })}
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {issues.map((issue) => (
              <Table.Row
                key={`${issue.path}:${issue.keyword}:${issue.message}`}
                id={`${issue.path}:${issue.keyword}:${issue.message}`}
              >
                <Table.Cell className="font-mono text-xs">
                  {issue.path || "/"}
                </Table.Cell>
                <Table.Cell className="font-mono text-xs">
                  {issue.keyword}
                </Table.Cell>
                <Table.Cell>{issue.message}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function StatusAlert({
  title,
  description,
  danger = false,
  success = false,
  icon = "warning",
}: {
  title: string;
  description: string;
  danger?: boolean;
  success?: boolean;
  icon?: "file" | "warning";
}) {
  const Icon = success
    ? BadgeCheck
    : icon === "file"
      ? FileJson2
      : TriangleAlert;
  return (
    <Alert status={danger ? "danger" : success ? "success" : undefined}>
      <Alert.Indicator>
        <Icon aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function detectDraft(schema: string) {
  return schema.includes("draft-07")
    ? "draft-07"
    : schema.includes("2019-09")
      ? "2019-09"
      : "2020-12";
}

export function JsonSchemaValidatorPage() {
  return (
    <ToolPage>
      <JsonSchemaValidatorPageContent />
    </ToolPage>
  );
}
