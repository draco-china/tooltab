import { useObjectUrl } from "@/hooks/use-object-url";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  InputGroup,
  Label,
  ListBox,
  Select,
  Skeleton,
  Switch,
} from "@heroui/react";
import { Download, RefreshCcw, Sparkles, TriangleAlert } from "lucide-react";
import {
  startTransition,
  useCallback,
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
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import {
  detectFormatterLanguage,
  languageConfigurations,
} from "@workspace/tools/format/prettier-config";
import {
  PRETTIER_FILE_ACCEPT,
  PRETTIER_PAGE_LANGUAGES,
} from "../code-formatters/prettier-page-config";
import { FORMATTER_INPUT_LIMIT } from "@workspace/tools/format/contract";
import {
  type FormatterLanguage,
  formatterLanguages,
  type PrettierOptions,
  prettierOptionsSchema,
} from "@workspace/tools/format/prettier-config";
import {
  FORMATTER_AUTO_LIMIT,
  FORMATTER_PREVIEW_LIMIT,
  type FormatterResult,
} from "../code-formatters/types";
import { runFormatterWorker } from "../code-formatters/worker-client";

type OutputState =
  | { state: "empty" }
  | { state: "formatting" }
  | { state: "formatted"; result: FormatterResult }
  | { state: "error"; message: string };

const DEFAULT_OPTIONS = prettierOptionsSchema.parse({});
const DEFAULT_SOURCE = PRETTIER_PAGE_LANGUAGES.javascript.sample;

function PrettierFormatterPageContent() {
  const readerRef = useRef<FileReader | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const revisionRef = useRef(0);
  const [sourceCode, setSourceCode] = useState(DEFAULT_SOURCE);
  const [options, setOptions] = useState<PrettierOptions>(DEFAULT_OPTIONS);
  const [submittedSource, setSubmittedSource] = useState(DEFAULT_SOURCE);
  const [submittedOptions, setSubmittedOptions] =
    useState<PrettierOptions>(DEFAULT_OPTIONS);
  const [outputState, setOutputState] = useState<OutputState>({
    state: "formatting",
  });
  const deferredSource = useDeferredValue(sourceCode);
  const deferredOptions = useDeferredValue(options);
  const isPendingLargeFormat =
    sourceCode.length >= FORMATTER_AUTO_LIMIT &&
    (sourceCode !== submittedSource ||
      JSON.stringify(options) !== JSON.stringify(submittedOptions));
  const formattedResult =
    outputState.state === "formatted" ? outputState.result : null;
  const downloadText = formattedResult?.output ?? null;
  const downloadBlob = useMemo(
    () =>
      downloadText === null
        ? null
        : new Blob([downloadText], { type: "text/plain;charset=utf-8" }),
    [downloadText],
  );
  const downloadUrl = useObjectUrl(downloadBlob);

  const stopReader = useCallback(() => {
    const reader = readerRef.current;
    if (!reader) return;
    reader.onload = null;
    reader.onerror = null;
    reader.onabort = null;
    if (reader.readyState === FileReader.LOADING) reader.abort();
    readerRef.current = null;
  }, []);

  const stopFormatting = useCallback(() => {
    revisionRef.current++;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const replaceSource = useCallback(
    (value: string) => {
      stopFormatting();
      stopReader();
      setOutputState(
        value.trim() && value.length < FORMATTER_AUTO_LIMIT
          ? { state: "formatting" }
          : { state: "empty" },
      );
      setSourceCode(value);
    },
    [stopFormatting, stopReader],
  );

  const updateOption = useCallback(
    <Key extends keyof PrettierOptions>(
      key: Key,
      value: PrettierOptions[Key],
    ) => {
      stopFormatting();
      stopReader();
      setOutputState(
        sourceCode.trim() && sourceCode.length < FORMATTER_AUTO_LIMIT
          ? { state: "formatting" }
          : { state: "empty" },
      );
      setOptions((current) => ({ ...current, [key]: value }));
    },
    [sourceCode, stopFormatting, stopReader],
  );

  useEffect(() => {
    if (sourceCode.length >= FORMATTER_AUTO_LIMIT) return;
    setSubmittedSource(deferredSource);
    setSubmittedOptions(deferredOptions);
  }, [deferredOptions, deferredSource, sourceCode.length]);

  useEffect(() => {
    stopFormatting();
    if (!submittedSource.trim()) {
      setOutputState({ state: "empty" });
      return;
    }
    const revision = revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setOutputState({ state: "formatting" });
    const timer = window.setTimeout(() => {
      timerRef.current = null;
      void (async () =>
        runFormatterWorker(
          {
            kind: "prettier",
            input: submittedSource,
            options: submittedOptions,
          },
          controller.signal,
        ))()
        .then((result) => {
          if (revision !== revisionRef.current || controller.signal.aborted)
            return;
          setOutputState({ state: "formatted", result });
        })
        .catch((error) => {
          if (revision !== revisionRef.current || controller.signal.aborted)
            return;
          setOutputState({
            state: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (controllerRef.current === controller)
            controllerRef.current = null;
        });
    }, 180);
    timerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [stopFormatting, submittedOptions, submittedSource]);

  useEffect(
    () => () => {
      stopFormatting();
      stopReader();
    },
    [stopFormatting, stopReader],
  );

  function changeLanguage(language: FormatterLanguage) {
    const previousLanguage = options.language;
    const shouldReplaceSample =
      !sourceCode.trim() ||
      sourceCode === PRETTIER_PAGE_LANGUAGES[previousLanguage].sample;
    stopFormatting();
    stopReader();
    setOptions((current) => ({ ...current, language }));
    if (shouldReplaceSample)
      setSourceCode(PRETTIER_PAGE_LANGUAGES[language].sample);
    setOutputState(
      shouldReplaceSample || sourceCode.length < FORMATTER_AUTO_LIMIT
        ? { state: "formatting" }
        : { state: "empty" },
    );
  }

  function useSample() {
    stopFormatting();
    stopReader();
    const language = options.language;
    startTransition(() => {
      setSourceCode(PRETTIER_PAGE_LANGUAGES[language].sample);
      setOptions({ ...DEFAULT_OPTIONS, language });
      setOutputState({ state: "formatting" });
    });
  }

  function formatNow() {
    stopFormatting();
    stopReader();
    setSubmittedSource(sourceCode);
    setSubmittedOptions(options);
  }

  function importFile(file: File) {
    stopFormatting();
    stopReader();
    const revision = ++revisionRef.current;
    setOutputState({ state: "formatting" });
    if (file.size > FORMATTER_INPUT_LIMIT) {
      setOutputState({ state: "error", message: "too_large" });
      return;
    }
    const reader = new FileReader();
    readerRef.current = reader;
    const finish = () => {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (readerRef.current === reader) readerRef.current = null;
    };
    reader.onload = () => {
      if (revision !== revisionRef.current) return;
      try {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(
          reader.result as ArrayBuffer,
        );
        const language = detectFormatterLanguage(file.name);
        finish();
        startTransition(() => {
          setSourceCode(value);
          if (language) setOptions((current) => ({ ...current, language }));
          setOutputState(
            value.trim() && value.length < FORMATTER_AUTO_LIMIT
              ? { state: "formatting" }
              : { state: "empty" },
          );
        });
      } catch {
        finish();
        setOutputState({ state: "error", message: "invalid_input" });
      }
    };
    reader.onerror = () => {
      if (revision !== revisionRef.current) return;
      finish();
      setOutputState({ state: "error", message: "read_failed" });
    };
    reader.onabort = finish;
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="grid min-w-0 gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-2"
        data-tool="prettier-code-formatter"
      >
        <div className="grid min-w-0 gap-6">
          <InputCard
            hasError={outputState.state === "error"}
            isPendingLargeFormat={isPendingLargeFormat}
            language={options.language}
            sourceCode={sourceCode}
            onClear={() => replaceSource("")}
            onFile={(file) => importFile(file)}
            onFormatNow={formatNow}
            onSourceCodeChange={replaceSource}
            onUseSample={useSample}
          />
          <OptionsCard
            options={options}
            onLanguageChange={changeLanguage}
            onOptionChange={updateOption}
          />
        </div>

        <OutputCard
          downloadUrl={downloadUrl}
          outputState={outputState}
          previewLanguage={options.language}
        />
      </div>

      <PrettierArticle />
    </div>
  );
}

function InputCard({
  hasError,
  isPendingLargeFormat,
  language,
  sourceCode,
  onClear,
  onFile,
  onFormatNow,
  onSourceCodeChange,
  onUseSample,
}: {
  hasError: boolean;
  isPendingLargeFormat: boolean;
  language: FormatterLanguage;
  sourceCode: string;
  onClear: () => void;
  onFile: (file: File) => void;
  onFormatNow: () => void;
  onSourceCodeChange: (value: string) => void;
  onUseSample: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 gap-1">
          <Card.Title>
            {m["tools.prettierCodeFormatter.inputLabel"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.prettierCodeFormatter.inputDescription"]()}
          </Card.Description>
        </div>
        <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <Button type="button" variant="ghost" size="sm" onPress={onUseSample}>
            <Sparkles aria-hidden className="size-4" />
            {m["common.curlSample"]()}
          </Button>
          <Button type="button" variant="ghost" size="sm" onPress={onClear}>
            <RefreshCcw aria-hidden className="size-4" />
            {m["common.curlClear"]()}
          </Button>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {isPendingLargeFormat ? (
          <p className="text-sm leading-6 text-muted">
            {m["tools.prettierCodeFormatter.formatPausedHint"]()}
          </p>
        ) : null}
        <div className="relative">
          <CodeEditor
            aria-label={m["tools.prettierCodeFormatter.inputLabel"]()}
            aria-invalid={hasError}
            height={320}
            language={language}
            modelPath={`tooltab://prettier-code-formatter/input.${language}`}
            value={sourceCode.slice(0, FORMATTER_PREVIEW_LIMIT)}
            readOnly={sourceCode.length > FORMATTER_PREVIEW_LIMIT}
            onChange={onSourceCodeChange}
          />
          {!sourceCode ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
            >
              {m["tools.prettierCodeFormatter.inputPlaceholder"]()}
            </span>
          ) : null}
        </div>
        <ToolFilePicker
          label={m["common.adler32importfromfilelabel"]()}
          accept={[...PRETTIER_FILE_ACCEPT]}
          onSelect={onFile}
        />
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex flex-wrap justify-between gap-3">
        {isPendingLargeFormat ? (
          <Button type="button" size="sm" onPress={onFormatNow}>
            <Sparkles aria-hidden className="size-4" />
            {m["tools.sqlFormatterAndLinter.fmtformat"]()}
          </Button>
        ) : null}
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function OptionsCard({
  onLanguageChange,
  onOptionChange,
  options,
}: {
  onLanguageChange: (language: FormatterLanguage) => void;
  onOptionChange: <Key extends keyof PrettierOptions>(
    key: Key,
    value: PrettierOptions[Key],
  ) => void;
  options: PrettierOptions;
}) {
  const id = useId();
  const configuration = languageConfigurations[options.language];
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.prettierCodeFormatter.optionsLabel"]()}
        description={m["tools.prettierCodeFormatter.optionsDescription"]()}
      />
      <ToolPanelCardContent className="grid gap-6 py-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Select
            aria-label={m["tools.sqlFormatterAndLinter.fmtlanguage"]()}
            selectedKey={options.language}
            variant="secondary"
            onSelectionChange={(key) => {
              if (key) onLanguageChange(String(key) as FormatterLanguage);
            }}
          >
            <Label htmlFor={`${id}-language`}>
              {m["tools.sqlFormatterAndLinter.fmtlanguage"]()}
            </Label>
            <Select.Trigger id={`${id}-language`} className="min-h-11 w-full">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Section>
                  {formatterLanguages.map((language) => (
                    <ListBox.Item
                      key={language}
                      id={language}
                      textValue={PRETTIER_PAGE_LANGUAGES[language].label}
                    >
                      {PRETTIER_PAGE_LANGUAGES[language].label}
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              </ListBox>
            </Select.Popover>
          </Select>
          <NumberOption
            id={`${id}-print-width`}
            label={m["tools.prettierCodeFormatter.printWidthLabel"]()}
            min={40}
            max={200}
            value={options.printWidth}
            onChange={(value) => onOptionChange("printWidth", value)}
          />
          <NumberOption
            id={`${id}-tab-width`}
            label={m["tools.prettierCodeFormatter.tabWidthLabel"]()}
            min={1}
            max={8}
            value={options.tabWidth}
            onChange={(value) => onOptionChange("tabWidth", value)}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <fieldset className="grid content-start gap-3">
            <legend className="mb-2 font-medium">
              {m["tools.prettierCodeFormatter.jsonIndent"]()}
            </legend>
            <ToggleOption
              label={m["tools.prettierCodeFormatter.useTabsLabel"]()}
              value={options.useTabs}
              onChange={(value) => onOptionChange("useTabs", value)}
            />
          </fieldset>

          <fieldset className="grid content-start gap-3">
            <legend className="mb-2 font-medium">
              {m["common.localfontstyle"]()}
            </legend>
            {configuration.script ? (
              <ToggleOption
                label={m["tools.sqlFormatterAndLinter.fmtsemi"]()}
                value={options.semi}
                onChange={(value) => onOptionChange("semi", value)}
              />
            ) : null}
            {configuration.script || configuration.quote ? (
              <ToggleOption
                label={m["tools.sqlFormatterAndLinter.fmtsinglequote"]()}
                value={options.singleQuote}
                onChange={(value) => onOptionChange("singleQuote", value)}
              />
            ) : null}
            {configuration.script ? (
              <Select
                aria-label={m["tools.sqlFormatterAndLinter.fmttrailingcomma"]()}
                selectedKey={options.trailingComma}
                variant="secondary"
                onSelectionChange={(key) => {
                  if (key)
                    onOptionChange(
                      "trailingComma",
                      String(key) as PrettierOptions["trailingComma"],
                    );
                }}
              >
                <Label htmlFor={`${id}-trailing-comma`}>
                  {m["tools.sqlFormatterAndLinter.fmttrailingcomma"]()}
                </Label>
                <Select.Trigger
                  id={`${id}-trailing-comma`}
                  className="min-h-11 w-full"
                >
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id="none"
                      textValue={m["tools.sqlFormatterAndLinter.fmtnone"]()}
                    >
                      {m["tools.sqlFormatterAndLinter.fmtnone"]()}
                    </ListBox.Item>
                    <ListBox.Item
                      id="es5"
                      textValue={m[
                        "tools.prettierCodeFormatter.trailingCommaEs5Label"
                      ]()}
                    >
                      {m["tools.prettierCodeFormatter.trailingCommaEs5Label"]()}
                    </ListBox.Item>
                    <ListBox.Item id="all" textValue={m["common.projectall"]()}>
                      {m["common.projectall"]()}
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}
          </fieldset>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function NumberOption({
  id,
  label,
  max,
  min,
  onChange,
  value,
}: {
  id: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <InputGroup variant="secondary" fullWidth className="min-h-11">
        <InputGroup.Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={String(value)}
          onChange={(event) => {
            const number = Number(event.currentTarget.value);
            if (Number.isFinite(number))
              onChange(Math.min(max, Math.max(min, Math.round(number))));
          }}
        />
      </InputGroup>
    </div>
  );
}

function ToggleOption({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <Switch aria-label={label} isSelected={value} onChange={onChange}>
      <Switch.Content className="flex min-h-11 items-center gap-3">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span>{label}</span>
      </Switch.Content>
    </Switch>
  );
}

function OutputCard({
  downloadUrl,
  outputState,
  previewLanguage,
}: {
  downloadUrl: string | null;
  outputState: OutputState;
  previewLanguage: FormatterLanguage;
}) {
  const result = outputState.state === "formatted" ? outputState.result : null;
  const downloadAction =
    downloadUrl && result ? (
      <a
        className={buttonVariants({ size: "sm" })}
        download={result.filename}
        href={downloadUrl}
      >
        <Download aria-hidden className="size-4" />
        {m["tools.prettierCodeFormatter.downloadFormattedLabel"]()}
      </a>
    ) : (
      <Button type="button" size="sm" isDisabled>
        <Download aria-hidden className="size-4" />
        {m["tools.prettierCodeFormatter.downloadFormattedLabel"]()}
      </Button>
    );
  if (result) {
    return (
      <CodeBlock
        code={result.output}
        previewCode={result.output.slice(0, FORMATTER_PREVIEW_LIMIT)}
        title={m["tools.prettierCodeFormatter.outputLabel"]()}
        description={m["tools.prettierCodeFormatter.outputDescription"]()}
        language={previewLanguage}
        copyLabel={m["tools.prettierCodeFormatter.copyFormattedLabel"]()}
        copiedLabel={m["common.actions.copied"]()}
        maxHeightClassName="min-h-80 max-h-[38rem]"
        actions={downloadAction}
      />
    );
  }
  return (
    <div
      className="grid min-w-0 gap-4"
      aria-busy={outputState.state === "formatting"}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">
            {m["tools.prettierCodeFormatter.outputLabel"]()}
          </h2>
          <p className="text-sm text-muted">
            {m["tools.prettierCodeFormatter.outputDescription"]()}
          </p>
        </div>
        {downloadAction}
      </div>
      {outputState.state === "formatting" ? (
        <OutputSkeleton
          label={m["tools.prettierCodeFormatter.formattingLabel"]()}
        />
      ) : outputState.state === "error" ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.prettierCodeFormatter.formatErrorLabel"]()}
            </Alert.Title>
            <Alert.Description>{outputState.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : (
        <section
          aria-label={m["tools.prettierCodeFormatter.outputLabel"]()}
          className="flex min-h-80 flex-col items-center justify-center p-6 text-center"
        >
          <p className="text-sm leading-6 text-muted">
            {m["tools.prettierCodeFormatter.outputEmptyDescription"]()}
          </p>
        </section>
      )}
    </div>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-80 content-start gap-3 rounded-xl border border-border p-4"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function PanelHeader({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
      {action ? (
        <ToolPanelActionGroup className="shrink-0 sm:justify-end">
          {action}
        </ToolPanelActionGroup>
      ) : null}
    </Card.Header>
  );
}

function PrettierArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.prettierCodeFormatter.articleWhatTitle"]()}</h2>
      <p>{m["tools.prettierCodeFormatter.articleWhatBody"]()}</p>
      <h2>{m["tools.prettierCodeFormatter.articleFormatsTitle"]()}</h2>
      <p>{m["tools.prettierCodeFormatter.articleFormatsBody"]()}</p>
      <h2>{m["tools.prettierCodeFormatter.articleHowTitle"]()}</h2>
      <p>
        {m["tools.prettierCodeFormatter.articleHowBeforeCode"]()}{" "}
        <code>{m["tools.sqlFormatterAndLinter.fmtformat"]()}</code>{" "}
        {m["tools.prettierCodeFormatter.articleHowAfterCode"]()}
      </p>
    </ToolArticle>
  );
}

export default function PrettierFormatterPage() {
  return (
    <ToolPage>
      <PrettierFormatterPageContent />
    </ToolPage>
  );
}
