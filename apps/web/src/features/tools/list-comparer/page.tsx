import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  ArrowLeftRight,
  Download,
  FileText,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  compareLists,
  DEFAULT_LIST_OPTIONS,
  type ListComparison,
  type ListOptions,
  ListSlugError,
  listResult,
  RESULT_KEYS,
  type ResultKey,
} from "@workspace/tools/text/lists";
import { runListSlug } from "./worker-client";

const DEFAULT_LEFT_SAMPLE = [
  "banana",
  "kiwi",
  "banana",
  "mango",
  "pear",
  "apple",
].join("\n");
const DEFAULT_RIGHT_SAMPLE = [
  "kiwi",
  "grape",
  "apple",
  "apple",
  "melon",
  "banana",
].join("\n");
const DELIMITER_MODES = ["newline", "comma", "tab", "custom"] as const;
const EMPTY_COMPARISON = compareLists("", "", DEFAULT_LIST_OPTIONS);

type ComparisonState =
  | { status: "ready"; comparison: ListComparison }
  | { status: "loading" }
  | { status: "error"; code: string };

function ListComparerPageContent() {
  const [leftText, setLeftText] = useState("");
  const [rightText, setRightText] = useState("");
  const [options, setOptions] = useState<ListOptions>(DEFAULT_LIST_OPTIONS);
  const [activeResult, setActiveResult] = useState<ResultKey>("shared");
  const deferredLeftText = useDeferredValue(leftText);
  const deferredRightText = useDeferredValue(rightText);
  const deferredOptions = useDeferredValue(options);
  const state = useComparison(
    deferredLeftText,
    deferredRightText,
    deferredOptions,
  );
  const comparison =
    state.status === "ready" ? state.comparison : EMPTY_COMPARISON;
  const currentHasAnyInput = leftText.length > 0 || rightText.length > 0;
  const hasAnyInput =
    deferredLeftText.length > 0 || deferredRightText.length > 0;
  const resultOptions = useMemo(
    () => buildResultOptions(comparison),
    [comparison],
  );
  const activeOption =
    resultOptions.find((option) => option.key === activeResult) ??
    resultOptions[0];
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl =
      state.status === "ready" &&
      currentHasAnyInput &&
      hasAnyInput &&
      (activeOption?.count ?? 0) > 0
        ? URL.createObjectURL(
            new Blob([activeOption?.output ?? ""], {
              type: activeOption?.downloadName.endsWith(".tsv")
                ? "text/tab-separated-values;charset=utf-8"
                : "text/plain;charset=utf-8",
            }),
          )
        : null;
    setDownloadUrl(nextUrl);
    return () => {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [activeOption, currentHasAnyInput, hasAnyInput, state.status]);

  const patchOptions = (patch: Partial<ListOptions>) =>
    setOptions((current) => ({ ...current, ...patch }));

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 gap-6" data-tool-panels>
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <CompareInputCard
            comparison={comparison}
            leftText={leftText}
            rightText={rightText}
            onLeftTextChange={setLeftText}
            onRightTextChange={setRightText}
            onSwap={() => {
              startTransition(() => {
                setLeftText(rightText);
                setRightText(leftText);
              });
            }}
            onLoadSample={() => {
              startTransition(() => {
                setLeftText(DEFAULT_LEFT_SAMPLE);
                setRightText(DEFAULT_RIGHT_SAMPLE);
              });
            }}
            onClear={() => {
              startTransition(() => {
                setLeftText("");
                setRightText("");
              });
            }}
          />
          <OptionsCard options={options} onPatch={patchOptions} />
        </div>

        {state.status === "error" ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>{errorMessage(state.code)}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <SummaryCard
          comparison={comparison}
          loading={state.status === "loading"}
        />
        <ResultCard
          activeResult={activeResult}
          hasAnyInput={hasAnyInput}
          loading={state.status === "loading"}
          resultOptions={resultOptions}
          downloadUrl={downloadUrl}
          onActiveResultChange={setActiveResult}
        />
      </div>
      <ToolArticle>
        <h2>{m["tools.listComparer.article0Title"]()}</h2>
        <p>{m["tools.listComparer.article0Body"]()}</p>

        <h2>{m["tools.listComparer.article1Title"]()}</h2>
        <p>{m["tools.listComparer.article1Body"]()}</p>

        <h2>{m["tools.listComparer.article2Title"]()}</h2>
        <p>{m["tools.listComparer.article2Body"]()}</p>
      </ToolArticle>
    </div>
  );
}

function useComparison(left: string, right: string, options: ListOptions) {
  const [state, setState] = useState<ComparisonState>({
    status: "ready",
    comparison: EMPTY_COMPARISON,
  });

  useEffect(() => {
    if (!left && !right) {
      setState({ status: "ready", comparison: EMPTY_COMPARISON });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    const timer = window.setTimeout(() => {
      void (async () =>
        runListSlug(
          { kind: "list", left, right, options },
          controller.signal,
        ))()
        .then((result) => {
          if (!controller.signal.aborted && typeof result === "object")
            setState({ status: "ready", comparison: result });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              status: "error",
              code: error instanceof ListSlugError ? error.code : "failure",
            });
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [left, options, right]);

  return state;
}

function CompareInputCard({
  comparison,
  leftText,
  rightText,
  onLeftTextChange,
  onRightTextChange,
  onSwap,
  onLoadSample,
  onClear,
}: {
  comparison: ListComparison;
  leftText: string;
  rightText: string;
  onLeftTextChange: (value: string) => void;
  onRightTextChange: (value: string) => void;
  onSwap: () => void;
  onLoadSample: () => void;
  onClear: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 gap-1">
          <Card.Title>{m["tools.listComparer.inputTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.listComparer.inputDescription"]()}
          </Card.Description>
        </div>
        <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onPress={onLoadSample}
          >
            <FileText aria-hidden className="size-4" />
            {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
          </Button>
          <Button type="button" size="sm" variant="ghost" onPress={onClear}>
            <RefreshCcw aria-hidden className="size-4" />
            {m["tools.listComparer.clearLists"]()}
          </Button>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <ListInput
            label={m["common.listslugLeft"]()}
            placeholder={m["tools.listComparer.listAplaceholder"]()}
            stats={m["common.listslugStats"]({
              total: comparison.left.totalCount,
              unique: comparison.left.uniqueCount,
            })}
            value={leftText}
            onChange={onLeftTextChange}
          />
          <ListInput
            label={m["common.listslugRight"]()}
            placeholder={m["tools.listComparer.listBplaceholder"]()}
            stats={m["common.listslugStats"]({
              total: comparison.right.totalCount,
              unique: comparison.right.uniqueCount,
            })}
            value={rightText}
            onChange={onRightTextChange}
          />
        </div>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex flex-wrap justify-start gap-3">
        <Button type="button" size="sm" variant="ghost" onPress={onSwap}>
          <ArrowLeftRight aria-hidden className="size-4" />
          {m["common.listslugSwap"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function ListInput({
  label,
  placeholder,
  stats,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  stats: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        <p className="text-xs text-muted">{stats}</p>
      </div>
      <TextArea
        aria-label={label}
        value={value}
        rows={12}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="min-h-80 resize-y text-sm"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

function OptionsCard({
  options,
  onPatch,
}: {
  options: ListOptions;
  onPatch: (patch: Partial<ListOptions>) => void;
}) {
  const delimiterLabels = {
    newline: m["common.listslugNewline"](),
    comma: m["common.listslugComma"](),
    tab: m["tools.listComparer.delimiterTabLabel"](),
    custom: m["common.listslugCustom"](),
  } as const;
  const checkboxes = [
    ["trimItems", m["tools.listComparer.trimItemsLabel"]()],
    ["ignoreCase", m["tools.listComparer.ignoreCaseLabel"]()],
    ["omitEmptyItems", m["tools.listComparer.omitEmptyItemsLabel"]()],
    ["sortResults", m["tools.listComparer.sortResultsLabel"]()],
  ] as const;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.listComparer.optionsTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.listComparer.optionsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-5 py-4">
        <Select
          variant="secondary"
          selectedKey={options.delimiterMode}
          onSelectionChange={(key) => {
            if (DELIMITER_MODES.includes(key as ListOptions["delimiterMode"]))
              onPatch({ delimiterMode: key as ListOptions["delimiterMode"] });
          }}
        >
          <Label>{m["tools.listComparer.delimiterLabel"]()}</Label>
          <Select.Trigger className="min-h-11 w-full">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox aria-label={m["tools.listComparer.delimiterLabel"]()}>
              {DELIMITER_MODES.map((mode) => (
                <ListBox.Item
                  key={mode}
                  id={mode}
                  textValue={delimiterLabels[mode]}
                >
                  {delimiterLabels[mode]}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {options.delimiterMode === "custom" ? (
          <div className="grid gap-2">
            <Label>{m["common.listslugCustomValue"]()}</Label>
            <Input
              aria-label={m["common.listslugCustomValue"]()}
              value={options.customDelimiter}
              placeholder="|"
              autoComplete="off"
              onChange={(event) =>
                onPatch({ customDelimiter: event.currentTarget.value })
              }
            />
          </div>
        ) : null}
        <div className="grid gap-3">
          {checkboxes.map(([key, label]) => (
            <Checkbox
              key={key}
              isSelected={options[key]}
              onChange={(checked) => onPatch({ [key]: checked === true })}
            >
              <Checkbox.Content className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span>{label}</span>
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SummaryCard({
  comparison,
  loading,
}: {
  comparison: ListComparison;
  loading: boolean;
}) {
  const metrics = metricOptions(comparison);
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.listComparer.summaryTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.listComparer.summaryDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-3 py-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-border bg-default/20 p-4"
          >
            <p className="text-sm text-muted">{metric.label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-12 rounded-lg" />
            ) : (
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {metric.value}
              </p>
            )}
          </div>
        ))}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

type ResultOption = {
  key: ResultKey;
  label: string;
  count: number;
  output: string;
  downloadName: string;
};

function ResultCard({
  activeResult,
  hasAnyInput,
  loading,
  resultOptions,
  downloadUrl,
  onActiveResultChange,
}: {
  activeResult: ResultKey;
  hasAnyInput: boolean;
  loading: boolean;
  resultOptions: ResultOption[];
  downloadUrl: string | null;
  onActiveResultChange: (value: ResultKey) => void;
}) {
  const activeOption =
    resultOptions.find((option) => option.key === activeResult) ??
    resultOptions[0];
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.listComparer.resultsTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.listComparer.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        {hasAnyInput ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full bg-default px-3 py-1 text-sm font-medium">
                {m["tools.listComparer.activeCountLabel"]({
                  count: String(activeOption?.count ?? 0),
                })}
              </span>
              {!loading && (activeOption?.count ?? 0) === 0 ? (
                <p className="text-sm text-muted">
                  {m["tools.listComparer.noItemsLabel"]()}
                </p>
              ) : null}
            </div>
            <ToggleButtonGroup
              selectionMode="single"
              selectedKeys={new Set([activeOption?.key ?? "shared"])}
              aria-label={m["common.listslugResult"]()}
              className="flex w-full flex-wrap [&_button]:min-h-11"
              onSelectionChange={(selection) => {
                const value = String([...selection][0] ?? "");
                if (RESULT_KEYS.includes(value as ResultKey))
                  onActiveResultChange(value as ResultKey);
              }}
            >
              {resultOptions.map((option) => (
                <ToggleButton key={option.key} id={option.key}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {loading ? (
              <div
                role="status"
                aria-label={m["tools.listComparer.resultsTitle"]()}
                className="grid min-h-72 gap-3"
              >
                <Skeleton className="h-4 w-full rounded-lg" />
                <Skeleton className="h-4 w-4/5 rounded-lg" />
                <Skeleton className="h-4 w-3/5 rounded-lg" />
              </div>
            ) : (
              <TextArea
                aria-label={m["tools.listComparer.resultsTitle"]()}
                value={activeOption?.output ?? ""}
                readOnly
                rows={10}
                className="min-h-72 resize-y font-mono text-sm"
              />
            )}
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-default/20 p-6 text-center">
            <FileText aria-hidden className="size-5 text-muted" />
            <div className="grid gap-1">
              <p className="font-medium">
                {m["tools.listComparer.emptyStateTitle"]()}
              </p>
              <p className="text-sm text-muted">
                {m["tools.listComparer.emptyStateDescription"]()}
              </p>
            </div>
          </div>
        )}
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex justify-end gap-3">
        <ToolCopyButton
          value={activeOption?.output ?? ""}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          disabled={!hasAnyInput || loading || (activeOption?.count ?? 0) === 0}
        />
        <Button
          type="button"
          size="sm"
          variant="primary"
          isDisabled={!downloadUrl}
          onPress={() => {
            if (!downloadUrl) return;
            const anchor = document.createElement("a");
            anchor.href = downloadUrl;
            anchor.download = activeOption?.downloadName ?? "result.txt";
            anchor.click();
          }}
        >
          <Download aria-hidden className="size-4" />
          {m["common.listslugDownload"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function buildResultOptions(comparison: ListComparison): ResultOption[] {
  const data = [
    ["shared", m["tools.listComparer.sharedLabel"](), "shared.txt"],
    ["left-only", m["tools.listComparer.leftOnlyLabel"](), "list-a-only.txt"],
    ["right-only", m["tools.listComparer.rightOnlyLabel"](), "list-b-only.txt"],
    ["all-unique", m["tools.listComparer.allUniqueLabel"](), "all-unique.txt"],
    [
      "left-duplicates",
      m["tools.listComparer.leftDuplicatesLabel"](),
      "list-a-duplicates.tsv",
    ],
    [
      "right-duplicates",
      m["tools.listComparer.rightDuplicatesLabel"](),
      "list-b-duplicates.tsv",
    ],
  ] as const;
  return data.map(([key, label, downloadName]) => {
    const result = listResult(comparison, key);
    return {
      key,
      label: `${label} (${result.count})`,
      count: result.count,
      output: result.output,
      downloadName,
    };
  });
}

function metricOptions(comparison: ListComparison) {
  return [
    {
      label: m["tools.listComparer.sharedLabel"](),
      value: comparison.sharedItems.length,
    },
    {
      label: m["tools.listComparer.leftOnlyLabel"](),
      value: comparison.leftOnlyItems.length,
    },
    {
      label: m["tools.listComparer.rightOnlyLabel"](),
      value: comparison.rightOnlyItems.length,
    },
    {
      label: m["tools.listComparer.allUniqueLabel"](),
      value: comparison.allUniqueItems.length,
    },
    {
      label: m["tools.listComparer.leftDuplicatesLabel"](),
      value: comparison.left.duplicateItems.length,
    },
    {
      label: m["tools.listComparer.rightDuplicatesLabel"](),
      value: comparison.right.duplicateItems.length,
    },
  ];
}

function errorMessage(code: string) {
  switch (code) {
    case "too_large":
      return m["tools.listComparer.localTooLargeError"]();
    case "invalid_unicode":
      return m["tools.listComparer.localInvalidUnicodeError"]();
    case "unsupported":
      return m["tools.listComparer.localUnsupportedError"]();
    case "invalid_options":
      return m["tools.listComparer.localInvalidOptionsError"]();
    default:
      return m["tools.listComparer.localFailureError"]();
  }
}

export function ListComparerPage() {
  return (
    <ToolPage instructions={m["tools.listComparer.usage"]()}>
      <ListComparerPageContent />
    </ToolPage>
  );
}

export default ListComparerPage;
