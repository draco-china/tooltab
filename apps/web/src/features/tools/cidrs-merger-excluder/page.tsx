import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Chip,
  Description,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { Network, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { useAsyncTask } from "@/hooks/use-async-task";
import { m } from "@/paraglide/messages.js";
import { CidrError } from "@workspace/tools/network/cidr";
import { type MergeOutput, runMerge } from "../cidr-tools/worker-client";

type MergerResult =
  | Readonly<{ status: "empty" | "missing-merge" }>
  | Readonly<{ status: "invalid"; error: CidrError }>
  | Readonly<{ status: "success"; output: MergeOutput }>;

function statusCopy(result: MergerResult) {
  if (result.status === "empty") {
    return {
      title: m["shared.cidrTools.cidrsMergerEmptyTitle"](),
      description: m["shared.cidrTools.cidrsMergerEmptyDescription"](),
    };
  }
  if (result.status === "missing-merge") {
    return {
      title: m["shared.cidrTools.cidrsMergerMissingMergeTitle"](),
      description: m["shared.cidrTools.cidrsMergerMissingMergeDescription"](),
    };
  }
  if (result.status === "invalid") {
    return {
      title: m["shared.cidrTools.cidrsMergerInvalidTitle"](),
      description: m["shared.cidrTools.cidrsMergerInvalidDescription"](),
    };
  }
  return null;
}

function formatError(error: CidrError["issues"][number]) {
  const group =
    error.group === "merge"
      ? m["shared.cidrTools.cidrsMergerMergeGroupLabel"]()
      : m["shared.cidrTools.cidrsMergerExcludeGroupLabel"]();
  return `${group}, ${m["shared.cidrTools.cidrsMergerLineLabel"]()} ${error.line}: ${error.value}`;
}

function InputPanel({
  merge,
  exclude,
  invalid,
  error,
  onMergeChange,
  onExcludeChange,
}: {
  merge: string;
  exclude: string;
  invalid: boolean;
  error: CidrError | null;
  onMergeChange: (value: string) => void;
  onExcludeChange: (value: string) => void;
}) {
  const mergeId = useId();
  const excludeId = useId();
  const visibleErrors = error?.issues.slice(0, 3) ?? [];
  const moreErrorCount = Math.max(
    0,
    (error?.issues.length ?? 0) - visibleErrors.length,
  );

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.cidrTools.cidrsMergerInputTitle"]()}</Card.Title>
        <Card.Description>
          {m["shared.cidrTools.cidrsMergerInputDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <TextField fullWidth isInvalid={invalid} className="gap-2">
          <Label htmlFor={mergeId}>
            {m["shared.cidrTools.cidrsMergerMergeLabel"]()}
          </Label>
          <Description>
            {m["shared.cidrTools.cidrsMergerMergeDescription"]()}
          </Description>
          <TextArea
            id={mergeId}
            name="cidrs-to-merge"
            autoComplete="off"
            spellCheck={false}
            value={merge}
            aria-invalid={invalid || undefined}
            placeholder={m["shared.cidrTools.cidrsMergerMergePlaceholder"]()}
            className="min-h-44 resize-y font-mono text-base"
            onChange={(event) => onMergeChange(event.currentTarget.value)}
          />
        </TextField>

        <TextField fullWidth isInvalid={invalid} className="gap-2">
          <Label htmlFor={excludeId}>
            {m["shared.cidrTools.cidrsMergerExcludeLabel"]()}
          </Label>
          <Description>
            {m["shared.cidrTools.cidrsMergerExcludeDescription"]()}
          </Description>
          <TextArea
            id={excludeId}
            name="cidrs-to-exclude"
            autoComplete="off"
            spellCheck={false}
            value={exclude}
            aria-invalid={invalid || undefined}
            placeholder={m["shared.cidrTools.cidrsMergerExcludePlaceholder"]()}
            className="min-h-32 resize-y font-mono text-base"
            onChange={(event) => onExcludeChange(event.currentTarget.value)}
          />
        </TextField>

        {invalid ? (
          <div aria-live="polite">
            <Alert status="danger" role="alert">
              <Alert.Indicator>
                <TriangleAlert aria-hidden className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>
                  {m["shared.cidrTools.cidrsMergerInvalidTitle"]()}
                </Alert.Title>
                <Alert.Description>
                  <span className="block">
                    {m["shared.cidrTools.cidrsMergerInvalidDescription"]()}
                  </span>
                  {visibleErrors.length > 0 ? (
                    <span className="mt-2 block font-mono text-xs break-all whitespace-pre-line">
                      {visibleErrors
                        .map((entry) => formatError(entry))
                        .join("\n")}
                      {moreErrorCount > 0
                        ? `\n${m["shared.cidrTools.cidrsMergerMoreErrorsLabel"]()}: ${moreErrorCount}`
                        : ""}
                    </span>
                  ) : null}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyResult({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 grid size-10 place-items-center rounded-full bg-default text-muted-foreground">
        <Network aria-hidden className="size-4" />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function ResultPanel({ result }: { result: MergerResult }) {
  const output = result.status === "success" ? result.output : null;
  const placeholder = statusCopy(result);
  const cidrs = output?.preview ? output.preview.split("\n") : [];

  return (
    <ToolPanelCard>
      <Card.Header className="grid-cols-[minmax(0,1fr)_auto] items-start border-b border-separator">
        <div className="min-w-0">
          <Card.Title>
            {m["shared.cidrTools.cidrsMergerResultTitle"]()}
          </Card.Title>
          <Card.Description>
            {m["shared.cidrTools.cidrsMergerResultDescription"]()}
          </Card.Description>
        </div>
        <ToolCopyButton
          value={output?.blob ?? ""}
          disabled={!output || output.summary.blockCount === 0}
          copyLabel={m["shared.cidrTools.cidrsMergerCopyLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
        />
      </Card.Header>
      <ToolPanelCardContent className="p-0!">
        {output ? (
          <>
            <div className="grid gap-4 border-b border-separator px-6 py-4 md:grid-cols-4">
              <SummaryMetric
                label={m["shared.cidrTools.cidrsMergerMergedInputCountLabel"]()}
                value={String(output.summary.mergeInputCount)}
              />
              <SummaryMetric
                label={m[
                  "shared.cidrTools.cidrsMergerExcludedInputCountLabel"
                ]()}
                value={String(output.summary.excludeInputCount)}
              />
              <SummaryMetric
                label={m["shared.cidrTools.cidrsMergerOutputCountLabel"]()}
                value={String(output.summary.blockCount)}
              />
              <div>
                <p className="text-sm text-muted-foreground">
                  {m["common.cidrDetailFamily"]()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {output.summary.familyLabels.map((family) => (
                    <Chip key={family} variant="tertiary">
                      {family}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
            {output.summary.blockCount === 0 ? (
              <EmptyResult
                title={m["shared.cidrTools.cidrsMergerNoCidrsTitle"]()}
                description={m[
                  "shared.cidrTools.cidrsMergerNoCidrsDescription"
                ]()}
              />
            ) : (
              <ol className="flex max-h-136 min-w-0 flex-col overflow-auto">
                {cidrs.map((cidr, index) => (
                  <li
                    key={cidr}
                    className="flex items-start gap-4 border-b border-separator px-6 py-3 last:border-b-0"
                  >
                    <span className="w-8 shrink-0 text-sm text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 font-mono text-sm break-all">
                      {cidr}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <EmptyResult
            title={
              placeholder?.title ??
              m["shared.cidrTools.cidrsMergerEmptyTitle"]()
            }
            description={
              placeholder?.description ??
              m["shared.cidrTools.cidrsMergerEmptyDescription"]()
            }
          />
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function MergerArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.cidrTools.cidrsMergerArticleWhatTitle"]()}</h2>
      <p>{m["shared.cidrTools.cidrsMergerArticleWhatBody"]()}</p>
      <h2>{m["shared.cidrTools.cidrsMergerArticleHowTitle"]()}</h2>
      <p>{m["shared.cidrTools.cidrsMergerArticleHowBody"]()}</p>
      <h2>{m["shared.cidrTools.cidrsMergerArticleWhenTitle"]()}</h2>
      <p>{m["shared.cidrTools.cidrsMergerArticleWhenBody"]()}</p>
      <h2>{m["shared.cidrTools.cidrsMergerArticleInputTitle"]()}</h2>
      <p>{m["shared.cidrTools.cidrsMergerArticleInputBody"]()}</p>
    </ToolArticle>
  );
}

function CidrsMergerContent() {
  const [merge, setMerge] = useState("");
  const [exclude, setExclude] = useState("");
  const task = useAsyncTask(runMerge);
  const { run, clear } = task;

  useEffect(() => {
    if (merge.trim() || exclude.trim()) void run({ merge, exclude });
    return clear;
  }, [exclude, merge, run, clear]);

  let result: MergerResult = {
    status: !merge.trim() && exclude.trim() ? "missing-merge" : "empty",
  };
  if (task.status === "success")
    result = { status: "success", output: task.result };
  else if (task.status === "error") {
    const error =
      task.error instanceof CidrError
        ? task.error
        : new CidrError("unsupported");
    result =
      error.code === "missing_merge"
        ? { status: "missing-merge" }
        : { status: "invalid", error };
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <InputPanel
          merge={merge}
          exclude={exclude}
          invalid={result.status === "invalid"}
          error={result.status === "invalid" ? result.error : null}
          onMergeChange={(value) => {
            if (value === merge) return;
            clear();
            setMerge(value);
          }}
          onExcludeChange={(value) => {
            if (value === exclude) return;
            clear();
            setExclude(value);
          }}
        />
        <ResultPanel result={result} />
      </div>
      <MergerArticle />
    </div>
  );
}

export default function CidrsMerger() {
  return (
    <ToolPage instructions={m["tools.cidrsMergerExcluder.usage"]()}>
      <CidrsMergerContent />
    </ToolPage>
  );
}
