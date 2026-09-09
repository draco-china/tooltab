import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { type RotType, rotateText } from "@workspace/tools/encoding/rot";

const DEFAULT_INPUT = "Hello World! 12345";
const DEFAULT_TYPE: RotType = 13;
const CONVERSION_DELAY_MS = 180;
const ROT_TYPES = [13, 5, 18, 47] as const;
const STORAGE_KEYS = {
  input: "tools:rot-cipher:input",
  type: "tools:rot-cipher:type",
} as const;

type Source = "input" | "output";

function parseRotType(value: unknown): RotType | null {
  const normalized =
    typeof value === "string" ? value.replace(/^rot/, "") : value;
  const type = Number(normalized);
  return ROT_TYPES.includes(type as RotType) ? (type as RotType) : null;
}

function convert(value: string, type: RotType, fallback: string) {
  try {
    return { value: rotateText(value, type), error: "" };
  } catch {
    return { value: "", error: fallback };
  }
}

const DESCRIPTIONS = {
  13: m["tools.rotCipher.rot13Description"],
  5: m["tools.rotCipher.rot5Description"],
  18: m["tools.rotCipher.rot18Description"],
  47: m["tools.rotCipher.rot47Description"],
} satisfies Record<RotType, () => string>;

function RotCipherContent() {
  const inputTooLarge = m["tools.rotCipher.inputTooLarge"]();
  const inputId = useId();
  const outputId = useId();
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<Source>("input");
  const [rotType, setRotType] = useState<RotType>(DEFAULT_TYPE);
  const [inputText, setInputText] = useState(DEFAULT_INPUT);
  const [outputText, setOutputText] = useState(() =>
    rotateText(DEFAULT_INPUT, DEFAULT_TYPE),
  );
  const [error, setError] = useState("");
  const sourceText = source === "input" ? inputText : outputText;

  useEffect(() => {
    let storedInput: string | null = null;
    let storedType: string | null = null;
    try {
      storedInput = localStorage.getItem(STORAGE_KEYS.input);
      storedType = localStorage.getItem(STORAGE_KEYS.type);
    } catch {}
    const nextInput = storedInput ?? DEFAULT_INPUT;
    const nextType = parseRotType(storedType) ?? DEFAULT_TYPE;
    const result = convert(nextInput, nextType, inputTooLarge);
    setRotType(nextType);
    setInputText(nextInput);
    setOutputText(result.value);
    setError(result.error);
    setHydrated(true);
  }, [inputTooLarge]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const result = convert(sourceText, rotType, inputTooLarge);
      setError(result.error);
      if (source === "input") setOutputText(result.value);
      else setInputText(result.value);
    }, CONVERSION_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [inputTooLarge, hydrated, rotType, source, sourceText]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.input, inputText);
      localStorage.setItem(STORAGE_KEYS.type, `rot${rotType}`);
    } catch {}
  }, [hydrated, inputText, rotType]);

  function reset() {
    setSource("input");
    setRotType(DEFAULT_TYPE);
    setInputText(DEFAULT_INPUT);
    setOutputText(rotateText(DEFAULT_INPUT, DEFAULT_TYPE));
    setError("");
  }

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["tools.rotCipher.rotTypeLabel"]()}</Card.Title>
          <Card.Description>
            {m["tools.rotCipher.clientRotTypeDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <ToggleButtonGroup
            aria-label={m["tools.rotCipher.rotTypeLabel"]()}
            selectionMode="single"
            selectedKeys={new Set([String(rotType)])}
            className="flex w-full flex-wrap justify-start [&_button]:min-h-11 [&_button]:flex-1"
            onSelectionChange={(selection) => {
              const next = Number([...selection][0] ?? "");
              const type = parseRotType(next);
              if (type) {
                setSource("input");
                setRotType(type);
              }
            }}
          >
            {ROT_TYPES.map((type) => (
              <ToggleButton
                key={type}
                id={String(type)}
                aria-label={`ROT${type}`}
              >
                ROT{type}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <p className="text-sm leading-6 text-muted">
            {DESCRIPTIONS[rotType]()}
          </p>
        </ToolPanelCardContent>
      </ToolPanelCard>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["tools.rotCipher.inputLabel"]()}</Card.Title>
              <Card.Description>
                {m["tools.rotCipher.inputPlaceholder"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <ToolCopyButton
                value={inputText}
                copyLabel={m["tools.rotCipher.copyInputLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
              />
              <Button type="button" variant="ghost" size="sm" onPress={reset}>
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.textcodecSample"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={inputId}
              aria-label={m["tools.rotCipher.inputLabel"]()}
              aria-invalid={source === "input" && Boolean(error)}
              value={inputText}
              onChange={(event) => {
                setSource("input");
                setInputText(event.currentTarget.value);
              }}
              className="min-h-64 resize-y font-mono text-sm"
              placeholder={m["tools.rotCipher.inputPlaceholder"]()}
              spellCheck={false}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["tools.rotCipher.outputLabel"]()}</Card.Title>
              <Card.Description>
                {m["tools.rotCipher.outputPlaceholder"]()}
              </Card.Description>
            </div>
            <ToolCopyButton
              value={outputText}
              copyLabel={m["tools.rotCipher.copyOutputLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
            />
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={outputId}
              aria-label={m["tools.rotCipher.outputLabel"]()}
              aria-invalid={source === "output" && Boolean(error)}
              value={outputText}
              onChange={(event) => {
                setSource("output");
                setOutputText(event.currentTarget.value);
              }}
              className="min-h-64 resize-y font-mono text-sm"
              placeholder={m["tools.rotCipher.outputPlaceholder"]()}
              spellCheck={false}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.rotCipher.article.title"]()}</h2>
        <p>{m["tools.rotCipher.article.paragraph1"]()}</p>
        <p>
          {m["tools.rotCipher.article.paragraph2Before"]()}
          <code>Hello</code>
          {m["tools.rotCipher.article.paragraph2Middle"]()}
          <code>Uryyb</code>
          {m["tools.rotCipher.article.paragraph2After"]()}
        </p>
        <p>{m["tools.rotCipher.article.paragraph3"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function RotCipher() {
  return (
    <ToolPage instructions={m["tools.rotCipher.usage"]()}>
      <RotCipherContent />
    </ToolPage>
  );
}
