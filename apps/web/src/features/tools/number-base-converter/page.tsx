import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Input, Label } from "@heroui/react";
import { FileText, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { convertBase } from "@workspace/tools/number/base";

const DEFAULT_SOURCE = { field: "decimal", value: "255" } as const;
const DEFAULT_CUSTOM_BASE = 58;
const DEBOUNCE_MS = 200;
const STORAGE_KEYS = {
  customBase: "tools:number-base-converter:custom-base",
  sourceField: "tools:number-base-converter:source-field",
  sourceValue: "tools:number-base-converter:source-value",
} as const;

const FIELD_IDS = [
  "binary",
  "octal",
  "decimal",
  "hexadecimal",
  "base32",
  "base36",
  "base62",
  "base64",
  "custom",
] as const;
type FieldId = (typeof FIELD_IDS)[number];
type Source = { field: FieldId; value: string };
type Values = Record<FieldId, string>;

const BASES: Record<FieldId, number> = {
  binary: 2,
  octal: 8,
  decimal: 10,
  hexadecimal: 16,
  base32: 32,
  base36: 36,
  base62: 62,
  base64: 64,
  custom: DEFAULT_CUSTOM_BASE,
};

function emptyValues(): Values {
  return Object.fromEntries(FIELD_IDS.map((field) => [field, ""])) as Values;
}

function convertValues(source: Source, customBase: number) {
  const input = source.value.trim();
  if (!input) return { kind: "empty" as const, values: emptyValues() };
  if (input.startsWith("-")) {
    const values = emptyValues();
    values[source.field] = source.value;
    return { kind: "invalid" as const, values };
  }
  const sourceBase =
    source.field === "custom" ? customBase : BASES[source.field];
  try {
    const decimal = convertBase(
      input,
      sourceBase,
      10,
      source.field === "base64",
    );
    const values = emptyValues();
    for (const field of FIELD_IDS) {
      const base = field === "custom" ? customBase : BASES[field];
      values[field] = convertBase(decimal, 10, base, false, field === "base64");
    }
    return { kind: "valid" as const, values };
  } catch {
    const values = emptyValues();
    values[source.field] = source.value;
    return { kind: "invalid" as const, values };
  }
}

function useDebouncedSource(source: Source) {
  const [value, setValue] = useState(source);
  useEffect(() => {
    if (source === value) return;
    const timer = window.setTimeout(() => setValue(source), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [source, value]);
  return value;
}

const FIELD_MESSAGES = {
  binary: [
    m["tools.numberBaseConverter.binaryLabel"],
    m["tools.numberBaseConverter.binaryPlaceholder"],
  ],
  octal: [
    m["tools.numberBaseConverter.octalLabel"],
    m["tools.numberBaseConverter.octalPlaceholder"],
  ],
  decimal: [
    m["tools.numberBaseConverter.decimalLabel"],
    m["tools.numberBaseConverter.decimalPlaceholder"],
  ],
  hexadecimal: [
    m["tools.numberBaseConverter.hexadecimalLabel"],
    m["tools.numberBaseConverter.hexadecimalPlaceholder"],
  ],
  base32: [
    m["common.numbercBase32"],
    m["tools.numberBaseConverter.base32Placeholder"],
  ],
  base36: [
    m["common.numbercBase36"],
    m["tools.numberBaseConverter.base36Placeholder"],
  ],
  base62: [
    m["common.numbercBase62"],
    m["tools.numberBaseConverter.base62Placeholder"],
  ],
  base64: [
    m["tools.numberBaseConverter.base64Label"],
    m["tools.numberBaseConverter.base64Placeholder"],
  ],
  custom: [
    m["tools.numberBaseConverter.customLabel"],
    m["tools.numberBaseConverter.customPlaceholder"],
  ],
} as const;

function NumberBaseConverterContent() {
  const id = useId();
  const [customBase, setCustomBase] = useState(DEFAULT_CUSTOM_BASE);
  const [customBaseDraft, setCustomBaseDraft] = useState(
    String(DEFAULT_CUSTOM_BASE),
  );
  const [source, setSource] = useState<Source>(DEFAULT_SOURCE);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const settledSource = useDebouncedSource(source);
  const pending = settledSource !== source;
  const result = useMemo(
    () => convertValues(settledSource, customBase),
    [customBase, settledSource],
  );
  const values = pending ? emptyValues() : result.values;
  if (pending) values[source.field] = source.value;

  useEffect(() => {
    const storedField = safeLocalStorage.getItem(STORAGE_KEYS.sourceField);
    const storedValue = safeLocalStorage.getItem(STORAGE_KEYS.sourceValue);
    const storedBase = safeLocalStorage.getItem(STORAGE_KEYS.customBase);
    if (storedField && FIELD_IDS.includes(storedField as FieldId)) {
      setSource({
        field: storedField as FieldId,
        value: storedValue ?? DEFAULT_SOURCE.value,
      });
    } else if (storedValue !== null) {
      setSource({ field: DEFAULT_SOURCE.field, value: storedValue });
    }
    if (storedBase !== null) {
      const base = clampBase(Number(storedBase));
      setCustomBase(base);
      setCustomBaseDraft(String(base));
    }
    setHasLoadedStorage(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    safeLocalStorage.setItem(STORAGE_KEYS.sourceField, source.field);
    safeLocalStorage.setItem(STORAGE_KEYS.sourceValue, source.value);
    safeLocalStorage.setItem(STORAGE_KEYS.customBase, String(customBase));
  }, [customBase, hasLoadedStorage, source]);

  const invalidField =
    !pending && result.kind === "invalid" ? settledSource.field : null;

  const change = (field: FieldId, value: string) => setSource({ field, value });
  const commitCustomBase = () => {
    const nextBase = clampBase(Number(customBaseDraft));
    const current = convertValues(source, customBase);
    if (current.kind === "valid") {
      setSource({ field: "decimal", value: current.values.decimal });
    }
    setCustomBase(nextBase);
    setCustomBaseDraft(String(nextBase));
  };

  return (
    <div className="grid gap-8">
      <div data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.numberBaseConverter.converterTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.numberBaseConverter.converterDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setSource(DEFAULT_SOURCE);
                  setCustomBase(DEFAULT_CUSTOM_BASE);
                  setCustomBaseDraft(String(DEFAULT_CUSTOM_BASE));
                }}
              >
                <FileText aria-hidden className="size-4" />
                {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => setSource({ field: "decimal", value: "" })}
              >
                <Trash2 aria-hidden className="size-4" />
                {m["common.formatclear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <BaseSection
              title={m["tools.numberBaseConverter.commonBasesTitle"]()}
              description={m[
                "tools.numberBaseConverter.commonBasesDescription"
              ]()}
              fields={FIELD_IDS.slice(0, 4)}
              values={values}
              invalidField={invalidField}
              id={id}
              copyLabel={m["tools.numberBaseConverter.copyValueLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              onChange={change}
            />
            <BaseSection
              title={m["tools.numberBaseConverter.extendedBasesTitle"]()}
              description={m[
                "tools.numberBaseConverter.extendedBasesDescription"
              ]()}
              fields={FIELD_IDS.slice(4, 8)}
              values={values}
              invalidField={invalidField}
              id={id}
              copyLabel={m["tools.numberBaseConverter.copyValueLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              onChange={change}
            />
            <section className="grid gap-4">
              <div className="grid gap-1">
                <h2 className="text-sm font-medium">
                  {m["tools.numberBaseConverter.customBaseTitle"]()}
                </h2>
                <p className="text-sm text-muted">
                  {m["tools.numberBaseConverter.customBaseDescription"]()}
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`${id}-custom-base`}>
                      {m["tools.numberBaseConverter.customBaseValueLabel"]()}
                    </Label>
                    <span aria-hidden className="invisible h-9 shrink-0" />
                  </div>
                  <Input
                    id={`${id}-custom-base`}
                    type="number"
                    min={2}
                    max={64}
                    inputMode="numeric"
                    className="h-11 font-mono text-base"
                    value={customBaseDraft}
                    onBlur={commitCustomBase}
                    onChange={(event) => setCustomBaseDraft(event.target.value)}
                  />
                </div>
                <BaseField
                  id={`${id}-custom`}
                  label={FIELD_MESSAGES.custom[0]()}
                  placeholder={FIELD_MESSAGES.custom[1]()}
                  value={values.custom}
                  invalid={invalidField === "custom"}
                  copyLabel={m["tools.numberBaseConverter.copyValueLabel"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  onChange={(value) => change("custom", value)}
                />
              </div>
            </section>
            <div className="grid gap-3 rounded-xl border border-dashed border-separator bg-default/30 p-4 text-sm text-muted">
              <p>{m["tools.numberBaseConverter.standardAlphabetHint"]()}</p>
              <p>{m["tools.numberBaseConverter.base64AlphabetHint"]()}</p>
            </div>
            {invalidField ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {m["tools.numberBaseConverter.invalidValueMessage"]({
                      base: FIELD_MESSAGES[invalidField][0](),
                    })}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <h2>{m["tools.numberBaseConverter.articleBasesTitle"]()}</h2>
        <p>{m["tools.numberBaseConverter.articleBasesBody"]()}</p>
        <h2>{m["tools.numberBaseConverter.articleHelpsTitle"]()}</h2>
        <p>{m["tools.numberBaseConverter.articleHelpsBody"]()}</p>
        <h2>{m["tools.numberBaseConverter.articleUseTitle"]()}</h2>
        <p>
          {m["tools.numberBaseConverter.articleUseBody"]()}
          <code>{m["tools.numberBaseConverter.articleAlphabet"]()}</code>
          {m["tools.dnsLookup.article.howAfterUrl"]()}
        </p>
      </ToolArticle>
    </div>
  );
}

function BaseSection({
  title,
  description,
  fields,
  values,
  invalidField,
  id,
  copyLabel,
  copiedLabel,
  onChange,
}: Readonly<{
  title: string;
  description: string;
  fields: readonly FieldId[];
  values: Values;
  invalidField: FieldId | null;
  id: string;
  copyLabel: string;
  copiedLabel: string;
  onChange: (field: FieldId, value: string) => void;
}>) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <BaseField
            key={field}
            id={`${id}-${field}`}
            label={FIELD_MESSAGES[field][0]()}
            placeholder={FIELD_MESSAGES[field][1]()}
            value={values[field]}
            invalid={invalidField === field}
            inputMode={field === "decimal" ? "numeric" : "text"}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            onChange={(value) => onChange(field, value)}
          />
        ))}
      </div>
    </section>
  );
}

function BaseField({
  id,
  label,
  placeholder,
  value,
  invalid,
  inputMode = "text",
  copyLabel,
  copiedLabel,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  placeholder: string;
  value: string;
  invalid: boolean;
  inputMode?: "numeric" | "text";
  copyLabel: string;
  copiedLabel: string;
  onChange: (value: string) => void;
}>) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <ToolCopyButton
          value={value}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          variant="ghost"
        />
      </div>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        aria-invalid={invalid || undefined}
        className="h-11 font-mono text-base"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function clampBase(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CUSTOM_BASE;
  return Math.min(64, Math.max(2, Math.trunc(value)));
}

export default function NumberBaseConverter() {
  return (
    <ToolPage instructions={m["tools.numberBaseConverter.usage"]()}>
      <NumberBaseConverterContent />
    </ToolPage>
  );
}
