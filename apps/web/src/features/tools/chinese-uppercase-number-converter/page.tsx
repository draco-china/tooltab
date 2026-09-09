import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  convertNumberToUppercase,
  convertUppercaseToNumber,
  type UppercaseVariant,
} from "@workspace/tools/number/chinese-uppercase";

type Variant = UppercaseVariant;
type ErrorKind =
  | "invalid-format"
  | "too-many-decimals"
  | "invalid-characters"
  | "out-of-range";

const STORAGE_KEYS = {
  variant: "tools:chinese-uppercase-number-converter:variant",
  number: "tools:chinese-uppercase-number-converter:number",
} as const;
const DEFAULT_NUMBER = "1234.56";

function convertNumber(value: string, variant: Variant) {
  const result = convertNumberToUppercase(value, variant);
  const error: ErrorKind | null =
    result.error === "tooManyDecimals"
      ? "too-many-decimals"
      : result.error === "outOfRange"
        ? "out-of-range"
        : result.error === "invalidFormat"
          ? "invalid-format"
          : null;
  return {
    value: result.isValid ? result.normalized : value,
    output: result.isValid ? result.value : "",
    error,
  };
}

function convertUppercase(value: string) {
  const result = convertUppercaseToNumber(value);
  const error: ErrorKind | null =
    result.error === "invalidCharacters"
      ? "invalid-characters"
      : result.error === "outOfRange"
        ? "out-of-range"
        : result.error === "invalidFormat"
          ? "invalid-format"
          : null;
  return {
    value: result.isValid ? result.normalized : value,
    output: result.isValid ? result.value : "",
    error,
  };
}

function numberError(error: ErrorKind | null) {
  if (error === "too-many-decimals")
    return m["tools.chineseUppercaseNumberConverter.numberTooManyDecimals"]();
  if (error === "out-of-range")
    return m["tools.chineseUppercaseNumberConverter.numberOutOfRange"]();
  if (error === "invalid-format")
    return m["tools.chineseUppercaseNumberConverter.numberInvalidFormat"]();
  return "";
}

function uppercaseError(error: ErrorKind | null) {
  if (error === "invalid-characters")
    return m[
      "tools.chineseUppercaseNumberConverter.uppercaseInvalidCharacters"
    ]();
  if (error === "out-of-range")
    return m["tools.chineseUppercaseNumberConverter.numberOutOfRange"]();
  if (error === "invalid-format")
    return m["tools.chineseUppercaseNumberConverter.uppercaseInvalidFormat"]();
  return "";
}

function ChineseUppercaseNumberConverterContent() {
  const numberId = useId();
  const uppercaseId = useId();
  const [variant, setVariant] = useState<Variant>("simplified");
  const initial = convertNumber(DEFAULT_NUMBER, "simplified");
  const [number, setNumber] = useState(initial.value);
  const [uppercase, setUppercase] = useState(initial.output);
  const [numberIssue, setNumberIssue] = useState<ErrorKind | null>(null);
  const [uppercaseIssue, setUppercaseIssue] = useState<ErrorKind | null>(null);

  useEffect(() => {
    try {
      const storedVariant = localStorage.getItem(STORAGE_KEYS.variant);
      const nextVariant: Variant =
        storedVariant === "traditional" ? "traditional" : "simplified";
      const storedNumber =
        localStorage.getItem(STORAGE_KEYS.number) ?? DEFAULT_NUMBER;
      const result = convertNumber(storedNumber, nextVariant);
      setVariant(nextVariant);
      setNumber(result.value);
      setUppercase(result.output);
      setNumberIssue(result.error);
      setUppercaseIssue(null);
    } catch {
      // Local storage is optional.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.variant, variant);
      localStorage.setItem(STORAGE_KEYS.number, number);
    } catch {
      // The converter remains usable without storage.
    }
  }, [number, variant]);

  function updateNumber(next: string, nextVariant = variant) {
    const result = convertNumber(next, nextVariant);
    setNumber(result.value);
    setUppercase(result.output);
    setNumberIssue(result.error);
    setUppercaseIssue(null);
  }

  function updateUppercase(next: string) {
    const result = convertUppercase(next);
    setUppercase(result.value);
    setNumber(result.output);
    setUppercaseIssue(result.error);
    setNumberIssue(null);
  }

  function changeVariant(next: Variant) {
    setVariant(next);
    updateNumber(number, next);
  }

  function reset() {
    setVariant("simplified");
    updateNumber(DEFAULT_NUMBER, "simplified");
  }

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["tools.chineseUppercaseNumberConverter.styleTitle"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.chineseUppercaseNumberConverter.styleDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <ToggleButtonGroup
            selectionMode="single"
            selectedKeys={new Set([variant])}
            aria-label={m["tools.chineseUppercaseNumberConverter.styleTitle"]()}
            className="w-full [&_button]:min-h-11 [&_button]:flex-1"
            onSelectionChange={(selection) => {
              const next = String([...selection][0] ?? "");
              if (next === "simplified" || next === "traditional")
                changeVariant(next);
            }}
          >
            <ToggleButton id="simplified">
              {m["common.numbercSimplified"]()}
            </ToggleButton>
            <ToggleButton id="traditional">
              {m["common.numbercTraditional"]()}
            </ToggleButton>
          </ToggleButtonGroup>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <div className="grid gap-6 lg:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["tools.chineseUppercaseNumberConverter.numberLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.chineseUppercaseNumberConverter.numberPlaceholder"]()}
            </Card.Description>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <ToolCopyButton
                value={number}
                copyLabel={m[
                  "tools.chineseUppercaseNumberConverter.copyNumberLabel"
                ]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
                disabled={Boolean(numberIssue)}
              />
              <Button variant="ghost" size="sm" onPress={reset}>
                <RefreshCw data-slot="icon" aria-hidden />
                {m["common.actions.reset"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-2 py-4">
            <label htmlFor={numberId} className="text-sm font-medium">
              {m["tools.chineseUppercaseNumberConverter.numberLabel"]()}
            </label>
            <Input
              id={numberId}
              value={number}
              inputMode="decimal"
              placeholder={m[
                "tools.chineseUppercaseNumberConverter.numberPlaceholder"
              ]()}
              aria-invalid={Boolean(numberIssue) || undefined}
              aria-describedby={`${numberId}-status`}
              onChange={(event) => updateNumber(event.currentTarget.value)}
            />
            <p
              id={`${numberId}-status`}
              role={numberIssue ? "alert" : undefined}
              className={
                numberIssue ? "text-sm text-danger" : "text-sm text-success"
              }
            >
              {numberIssue
                ? numberError(numberIssue)
                : number
                  ? m["tools.chineseUppercaseNumberConverter.numberValid"]()
                  : ""}
            </p>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["tools.chineseUppercaseNumberConverter.uppercaseLabel"]()}
            </Card.Title>
            <Card.Description>
              {m[
                "tools.chineseUppercaseNumberConverter.uppercasePlaceholder"
              ]()}
            </Card.Description>
            <ToolCopyButton
              value={uppercase}
              copyLabel={m[
                "tools.chineseUppercaseNumberConverter.copyUppercaseLabel"
              ]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
              disabled={Boolean(uppercaseIssue)}
              className="sm:col-start-2 sm:row-span-2 sm:row-start-1"
            />
          </Card.Header>
          <ToolPanelCardContent className="gap-2 py-4">
            <label htmlFor={uppercaseId} className="text-sm font-medium">
              {m["tools.chineseUppercaseNumberConverter.uppercaseLabel"]()}
            </label>
            <TextArea
              id={uppercaseId}
              value={uppercase}
              aria-label={m[
                "tools.chineseUppercaseNumberConverter.uppercaseLabel"
              ]()}
              aria-invalid={Boolean(uppercaseIssue) || undefined}
              aria-describedby={`${uppercaseId}-status`}
              placeholder={m[
                "tools.chineseUppercaseNumberConverter.uppercasePlaceholder"
              ]()}
              spellCheck={false}
              className="min-h-48 resize-y font-mono text-sm"
              onChange={(event) => updateUppercase(event.currentTarget.value)}
            />
            <p
              id={`${uppercaseId}-status`}
              role={uppercaseIssue ? "alert" : undefined}
              className={
                uppercaseIssue ? "text-sm text-danger" : "text-sm text-success"
              }
            >
              {uppercaseIssue
                ? uppercaseError(uppercaseIssue)
                : uppercase
                  ? m["tools.chineseUppercaseNumberConverter.uppercaseValid"]()
                  : ""}
            </p>
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.chineseUppercaseNumberConverter.articleWhatTitle"]()}</h2>
        <p>{m["tools.chineseUppercaseNumberConverter.articleWhatBodyOne"]()}</p>
        <p>{m["tools.chineseUppercaseNumberConverter.articleWhatBodyTwo"]()}</p>
        <h3>
          {m["tools.chineseUppercaseNumberConverter.articleRulesTitle"]()}
        </h3>
        <p>
          {m["tools.chineseUppercaseNumberConverter.articleRulesBodyOne"]()}
        </p>
        <p>
          {m[
            "tools.chineseUppercaseNumberConverter.articleRulesBodyTwoBefore"
          ]()}
          <code>1024.50</code>
          {m[
            "tools.chineseUppercaseNumberConverter.articleRulesBodyTwoMiddle"
          ]()}
          <code>壹仟零贰拾肆元伍角</code>
          {m[
            "tools.chineseUppercaseNumberConverter.articleRulesBodyTwoAfter"
          ]()}
          <code>壹仟零貳拾肆元伍角</code>
          {m["tools.chineseUppercaseNumberConverter.articleRulesBodyTwoEnd"]()}
        </p>
        <h3>
          {m["tools.chineseUppercaseNumberConverter.articleStylesTitle"]()}
        </h3>
        <p>
          {m["tools.chineseUppercaseNumberConverter.articleStylesBodyOne"]()}
        </p>
        <p>
          {m["tools.chineseUppercaseNumberConverter.articleStylesBodyTwo"]()}
        </p>
      </ToolArticle>
    </div>
  );
}

export function ChineseUppercaseNumberConverter() {
  return (
    <ToolPage instructions={m["tools.chineseUppercaseNumberConverter.usage"]()}>
      <ChineseUppercaseNumberConverterContent />
    </ToolPage>
  );
}

export default ChineseUppercaseNumberConverter;
