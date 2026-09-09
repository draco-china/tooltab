import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, TextArea } from "@heroui/react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  CaseConversionError,
  caseStyles,
  convertTextCases,
} from "@workspace/tools/text/case";

const STORAGE_KEY = "tools:case-converter:input";
const DEFAULT_INPUT = "Hello World Example";
const CASE_LABELS = {
  camel: "camelCase",
  pascal: "PascalCase",
  snake: "snake_case",
  constant: "SCREAMING_SNAKE_CASE",
  kebab: "kebab-case",
  cobol: "SCREAMING-KEBAB-CASE",
  dot: "dot.case",
  path: "path/case",
  title: "Title Case",
  sentence: "Sentence case",
  upper: "UPPERCASE",
  lower: "lowercase",
} as const;

function CaseOutputCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Card.Header className="grid-cols-[minmax(0,1fr)_auto] items-center">
        <Card.Title>{label}</Card.Title>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          variant="ghost"
        />
      </Card.Header>
      <Card.Content>
        <code className="block rounded-lg bg-default px-3 py-2 font-mono text-sm break-all">
          {value || "—"}
        </code>
      </Card.Content>
    </Card>
  );
}

function CaseArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.textCase.article.whatTitle"]()}</h2>
      <p>{m["shared.textCase.article.what"]()}</p>
      <h2>{m["shared.textCase.article.stylesTitle"]()}</h2>
      <ul>
        <li>
          <strong>camelCase</strong>
          {m["shared.textCase.article.styleFourAfter"]()}
          <strong>PascalCase</strong>
          {m["shared.textCase.article.styleOne"]()}
        </li>
        <li>
          <strong>snake_case</strong>
          {m["shared.textCase.article.styleFourAfter"]()}
          <strong>SCREAMING_SNAKE_CASE</strong>
          {m["shared.textCase.article.styleTwo"]()}
        </li>
        <li>
          <strong>kebab-case</strong>
          {m["shared.textCase.article.styleFourAfter"]()}
          <strong>SCREAMING-KEBAB-CASE</strong>
          {m["shared.textCase.article.styleThree"]()}
        </li>
        <li>
          <strong>dot.case</strong>
          {m["shared.textCase.article.styleFourAfter"]()}
          <strong>path/case</strong>
          {m["shared.textCase.article.styleFour"]()}
        </li>
        <li>
          <strong>Title Case</strong>
          {m["shared.textCase.article.styleFiveSeparatorOne"]()}
          <strong>Sentence case</strong>
          {m["shared.textCase.article.styleFiveSeparatorOne"]()}
          <strong>UPPERCASE</strong>
          {m["shared.textCase.article.styleFiveSeparatorThree"]()}
          <strong>lowercase</strong>
          {m["shared.textCase.article.styleFive"]()}
        </li>
      </ul>
      <h2>{m["shared.textCase.article.whenTitle"]()}</h2>
      <ul>
        <li>{m["shared.textCase.article.whenOne"]()}</li>
        <li>{m["shared.textCase.article.whenTwo"]()}</li>
        <li>{m["shared.textCase.article.whenThree"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function TextCaseConverterContent() {
  const locale = getLocale();
  const inputId = useId();
  const [inputText, setInputText] = useState(DEFAULT_INPUT);
  const deferredInput = useDeferredValue(inputText);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setInputText(stored);
    } catch {
      // Storage can be unavailable without affecting conversion.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, inputText);
    } catch {
      // Keep the converter usable when browser storage is blocked or full.
    }
  }, [inputText]);

  const result = useMemo(() => {
    try {
      return { values: convertTextCases(deferredInput), error: "" };
    } catch (error) {
      return {
        values: null,
        error:
          error instanceof CaseConversionError && error.code === "too_large"
            ? m["shared.textCase.tooLargeMessage"]({}, { locale })
            : m["shared.textCase.invalidUnicodeMessage"]({}, { locale }),
      };
    }
  }, [locale, deferredInput]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>{m["common.caseInput"]()}</Card.Title>
              <Card.Description>
                {m["shared.textCase.inputDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => setInputText("")}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.clear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={inputId}
              name="case-input"
              autoComplete="off"
              rows={3}
              aria-label={m["common.caseInput"]()}
              aria-invalid={Boolean(result.error) || undefined}
              aria-describedby={result.error ? `${inputId}-error` : undefined}
              value={inputText}
              onChange={(event) => setInputText(event.currentTarget.value)}
              className="resize-y font-mono text-sm"
              placeholder={m["shared.textCase.inputPlaceholder"]()}
            />
            {result.error ? (
              <Alert id={`${inputId}-error`} status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>{result.error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {caseStyles.map((style) => (
            <CaseOutputCard
              key={style}
              label={CASE_LABELS[style]}
              value={result.values?.[style] ?? ""}
            />
          ))}
        </div>
      </div>

      <CaseArticle />
    </div>
  );
}

export default function TextCaseConverter() {
  return (
    <ToolPage>
      <TextCaseConverterContent />
    </ToolPage>
  );
}
