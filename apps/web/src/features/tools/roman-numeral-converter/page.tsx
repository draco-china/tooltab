import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { BadgeCheck, FileText, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  fromRoman,
  RomanNumeralConversionError,
  toRoman,
} from "@workspace/tools/number/roman";

const DEFAULT_ARABIC_INPUT = "2024";
const DEFAULT_ROMAN_INPUT = "MMXXIV";
const CONVERSION_DELAY_MS = 180;
const STORAGE_KEYS = {
  arabic: "tools:roman-numeral-converter:arabic-input",
  roman: "tools:roman-numeral-converter:roman-input",
} as const;

type Source = "arabic" | "roman";
type Result =
  | { status: "idle"; arabic: ""; roman: ""; error: "" }
  | { status: "valid"; arabic: string; roman: string; error: "" }
  | { status: "invalid"; arabic: string; roman: string; error: string };

function convert(source: Source, value: string): Result {
  if (!value.trim())
    return { status: "idle", arabic: "", roman: "", error: "" };
  try {
    if (source === "roman") {
      const roman = value.trim().toUpperCase();
      const arabic = fromRoman(roman);
      return { status: "valid", arabic, roman: toRoman(arabic), error: "" };
    }
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized))
      throw new RomanNumeralConversionError("invalid_integer");
    const roman = toRoman(normalized);
    return {
      status: "valid",
      arabic: String(Number(normalized)),
      roman,
      error: "",
    };
  } catch (error) {
    const rangeError =
      error instanceof RomanNumeralConversionError &&
      error.code === "roman_range";
    return {
      status: "invalid",
      arabic: source === "arabic" ? value.trim() : "",
      roman: source === "roman" ? value.trim().toUpperCase() : "",
      error:
        source === "roman"
          ? m["tools.romanNumeralConverter.invalidRomanNumeral"]()
          : rangeError
            ? m["tools.romanNumeralConverter.outOfRangeArabicNumber"]()
            : m["tools.romanNumeralConverter.invalidArabicNumber"](),
    };
  }
}

function RomanNumeralConverterContent() {
  const arabicId = useId();
  const romanId = useId();
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<Source>("arabic");
  const [arabicInput, setArabicInput] = useState(DEFAULT_ARABIC_INPUT);
  const [romanInput, setRomanInput] = useState(DEFAULT_ROMAN_INPUT);
  const [result, setResult] = useState<Result>(() =>
    convert("arabic", DEFAULT_ARABIC_INPUT),
  );
  const sourceValue = source === "arabic" ? arabicInput : romanInput;

  useEffect(() => {
    let storedArabic: string | null = null;
    let storedRoman: string | null = null;
    try {
      storedArabic = localStorage.getItem(STORAGE_KEYS.arabic);
      storedRoman = localStorage.getItem(STORAGE_KEYS.roman);
    } catch {}
    const arabic = storedArabic ?? DEFAULT_ARABIC_INPUT;
    const roman = storedRoman ?? DEFAULT_ROMAN_INPUT;
    const restoredSource: Source = storedRoman?.trim() ? "roman" : "arabic";
    setArabicInput(arabic);
    setRomanInput(roman);
    setSource(restoredSource);
    setResult(
      convert(restoredSource, restoredSource === "roman" ? roman : arabic),
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const next = convert(source, sourceValue);
      setResult(next);
      if (source === "arabic") setRomanInput(next.roman);
      else setArabicInput(next.arabic);
    }, CONVERSION_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [hydrated, source, sourceValue]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.arabic, arabicInput);
      localStorage.setItem(STORAGE_KEYS.roman, romanInput);
    } catch {}
  }, [arabicInput, hydrated, romanInput]);

  const statusLabel =
    result.status === "valid"
      ? m["shared.jsonSchemaTools.valid"]()
      : m["shared.jsonSchemaTools.invalid"]();
  const isValid = result.status === "valid";
  const resultValues = [
    [m["tools.romanNumeralConverter.arabicNumber"](), result.arabic],
    [m["tools.romanNumeralConverter.romanNumeral"](), result.roman],
  ] as const;

  function loadSample() {
    setSource("arabic");
    setArabicInput(DEFAULT_ARABIC_INPUT);
    setRomanInput(DEFAULT_ROMAN_INPUT);
    setResult(convert("arabic", DEFAULT_ARABIC_INPUT));
  }

  function clear() {
    setSource("arabic");
    setArabicInput("");
    setRomanInput("");
    setResult({ status: "idle", arabic: "", roman: "", error: "" });
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Card.Title>
                  {m["tools.romanNumeralConverter.name"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.romanNumeralConverter.optionsDescription"]()}
                </Card.Description>
              </div>
              <ToolPanelActionGroup className="shrink-0 justify-end">
                <Button variant="ghost" size="sm" onPress={loadSample}>
                  <FileText aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
                </Button>
                <Button variant="ghost" size="sm" onPress={clear}>
                  <Trash2 aria-hidden className="size-4" />
                  {m["common.curlClear"]()}
                </Button>
              </ToolPanelActionGroup>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <TextField fullWidth className="gap-2">
              <Label htmlFor={arabicId}>
                {m["tools.romanNumeralConverter.arabicNumber"]()}
              </Label>
              <Input
                id={arabicId}
                inputMode="numeric"
                className="min-h-11 text-left font-mono text-base [unicode-bidi:isolate]"
                value={arabicInput}
                placeholder={m[
                  "tools.romanNumeralConverter.arabicPlaceholder"
                ]()}
                onChange={(event) => {
                  setSource("arabic");
                  setArabicInput(event.currentTarget.value);
                }}
              />
            </TextField>
            <TextField fullWidth className="gap-2">
              <Label htmlFor={romanId}>
                {m["tools.romanNumeralConverter.romanNumeral"]()}
              </Label>
              <Input
                id={romanId}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-11 text-left font-mono text-base uppercase [unicode-bidi:isolate]"
                value={romanInput}
                placeholder={m[
                  "tools.romanNumeralConverter.romanPlaceholder"
                ]()}
                onChange={(event) => {
                  setSource("roman");
                  setRomanInput(event.currentTarget.value.toUpperCase());
                }}
              />
            </TextField>
            <div className="grid gap-2 rounded-xl border border-dashed border-border/80 bg-default/35 p-4 text-sm text-muted">
              <p>{m["tools.romanNumeralConverter.rangeHint"]()}</p>
              <p>{m["tools.romanNumeralConverter.notationHint"]()}</p>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.morseCodeConverter.resultTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.romanNumeralConverter.resultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {result.status === "idle" ? (
              <p className="text-sm text-muted">
                {m["tools.romanNumeralConverter.emptyState"]()}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    size="sm"
                    color={isValid ? "success" : "danger"}
                    variant="secondary"
                  >
                    {statusLabel}
                  </Chip>
                  <Chip size="sm" variant="tertiary">
                    {m["tools.romanNumeralConverter.rangeHint"]()}
                  </Chip>
                </div>
                <Alert
                  status={isValid ? "success" : "danger"}
                  role={isValid ? undefined : "alert"}
                >
                  <Alert.Indicator>
                    {isValid ? (
                      <BadgeCheck aria-hidden className="size-4" />
                    ) : (
                      <TriangleAlert aria-hidden className="size-4" />
                    )}
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>{statusLabel}</Alert.Title>
                    <Alert.Description>
                      {isValid
                        ? m["tools.romanNumeralConverter.notationHint"]()
                        : result.error}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
                {isValid ? (
                  <div className="grid gap-4">
                    {resultValues.map(([label, value]) => (
                      <div
                        key={label}
                        className="min-w-0 rounded-xl border border-border/70 bg-default/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium tracking-wide text-muted uppercase">
                            {label}
                          </p>
                          <ToolCopyButton
                            value={value}
                            copyLabel={m["common.actions.copy"]()}
                            copiedLabel={m["common.actions.copied"]()}
                            variant="ghost"
                          />
                        </div>
                        <p className="mt-3 font-mono text-lg break-all">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.romanNumeralConverter.articleWhyTitle"]()}</h2>
        <p>{m["tools.romanNumeralConverter.articleWhyBody"]()}</p>
        <h2>{m["tools.morseCodeConverter.article.helpsTitle"]()}</h2>
        <p>{m["tools.romanNumeralConverter.articleHelpsBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58EncoderArticleWhenTitle"]()}</h2>
        <p>{m["tools.romanNumeralConverter.articleWhenBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function RomanNumeralConverter() {
  return (
    <ToolPage instructions={m["tools.romanNumeralConverter.usage"]()}>
      <RomanNumeralConverterContent />
    </ToolPage>
  );
}
