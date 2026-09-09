import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Label,
  Skeleton,
  TextArea,
} from "@heroui/react";
import { FileText, Play, Square, Trash2, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { TextUtilityError, type UtilityResult } from "../text-utilities/logic";
import { runUtilityWorker } from "../text-utilities/worker-client";

type ActiveSource = "text" | "morse";
type MorseResult = Extract<UtilityResult, { kind: "morse" }>;
type ConversionState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; result: MorseResult }
  | { state: "error"; message: string };

const DEFAULT_TEXT_INPUT = "HELLO WORLD";
const DEFAULT_MORSE_INPUT = ".... . .-.. .-.. --- / .-- --- .-. .-.. -..";
const CONVERSION_DELAY_MS = 150;

function MorseCodeConverterPageContent() {
  const conversionControllerRef = useRef<AbortController | null>(null);
  const conversionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversionRevisionRef = useRef(0);
  const audioControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const audioRevisionRef = useRef(0);
  const [textInput, setTextInput] = useState(DEFAULT_TEXT_INPUT);
  const [morseInput, setMorseInput] = useState(DEFAULT_MORSE_INPUT);
  const [activeSource, setActiveSource] = useState<ActiveSource>("text");
  const [conversionVersion, setConversionVersion] = useState(0);
  const [conversion, setConversion] = useState<ConversionState>({
    state: "loading",
  });
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const sourceInput = activeSource === "text" ? textInput : morseInput;
  const result = conversion.state === "ready" ? conversion.result : null;
  const invalidMorseCode = m["tools.morseCodeConverter.invalidLabel"]();
  const conversionError = m["tools.morseCodeConverter.localConversionError"]();
  const isValid = result !== null && result.morse.length > 0;

  function cancelConversion() {
    conversionRevisionRef.current++;
    if (conversionTimerRef.current !== null) {
      clearTimeout(conversionTimerRef.current);
      conversionTimerRef.current = null;
    }
    conversionControllerRef.current?.abort();
    conversionControllerRef.current = null;
  }

  function releaseAudio(updateState = true) {
    audioRevisionRef.current++;
    audioControllerRef.current?.abort();
    audioControllerRef.current = null;
    const player = audioRef.current;
    if (player) {
      player.pause();
      player.onended = null;
      player.onerror = null;
    }
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = "";
    if (updateState) {
      setIsPreparingAudio(false);
      setIsPlaying(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: teardown functions only read stable refs and must run once on unmount
  useEffect(
    () => () => {
      cancelConversion();
      releaseAudio(false);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: conversionVersion reruns the unchanged sample after explicit user action
  useEffect(() => {
    if (!sourceInput.trim()) {
      setConversion({ state: "idle" });
      return;
    }

    const revision = ++conversionRevisionRef.current;
    const controller = new AbortController();
    conversionControllerRef.current = controller;
    setConversion({ state: "loading" });
    conversionTimerRef.current = setTimeout(() => {
      conversionTimerRef.current = null;
      void (async () => {
        try {
          const output = await runUtilityWorker(
            {
              kind: "morse",
              input: sourceInput,
              mode: activeSource === "text" ? "encode" : "decode",
            },
            controller.signal,
          );
          if (
            output.kind !== "morse" ||
            revision !== conversionRevisionRef.current ||
            conversionControllerRef.current !== controller
          ) {
            return;
          }
          if (activeSource === "text") setMorseInput(output.morse);
          else setTextInput(output.text);
          setConversion({ state: "ready", result: output });
        } catch (error) {
          if (
            revision !== conversionRevisionRef.current ||
            conversionControllerRef.current !== controller ||
            controller.signal.aborted
          ) {
            return;
          }
          setConversion({
            state: "error",
            message:
              error instanceof TextUtilityError &&
              error.code === "invalid_morse"
                ? invalidMorseCode
                : conversionError,
          });
        } finally {
          if (conversionControllerRef.current === controller) {
            conversionControllerRef.current = null;
          }
        }
      })();
    }, CONVERSION_DELAY_MS);

    return () => {
      if (conversionTimerRef.current !== null) {
        clearTimeout(conversionTimerRef.current);
        conversionTimerRef.current = null;
      }
      controller.abort();
      if (conversionControllerRef.current === controller) {
        conversionControllerRef.current = null;
      }
    };
  }, [
    activeSource,
    conversionError,
    conversionVersion,
    invalidMorseCode,
    sourceInput,
  ]);

  function changeText(value: string) {
    cancelConversion();
    releaseAudio();
    setActiveSource("text");
    setTextInput(value);
    setMorseInput("");
    setConversion(value.trim() ? { state: "loading" } : { state: "idle" });
  }

  function changeMorse(value: string) {
    cancelConversion();
    releaseAudio();
    setActiveSource("morse");
    setMorseInput(value);
    setTextInput("");
    setConversion(value.trim() ? { state: "loading" } : { state: "idle" });
  }

  function loadSample() {
    cancelConversion();
    releaseAudio();
    setActiveSource("text");
    setTextInput(DEFAULT_TEXT_INPUT);
    setMorseInput(DEFAULT_MORSE_INPUT);
    setConversion({ state: "loading" });
    setConversionVersion((version) => version + 1);
  }

  function clear() {
    cancelConversion();
    releaseAudio();
    setActiveSource("text");
    setTextInput("");
    setMorseInput("");
    setConversion({ state: "idle" });
  }

  async function play() {
    if (!isValid || !result?.morse) return;
    releaseAudio();
    const revision = audioRevisionRef.current;
    const controller = new AbortController();
    audioControllerRef.current = controller;
    setIsPreparingAudio(true);
    try {
      const output = await runUtilityWorker(
        { kind: "audio", input: result.morse },
        controller.signal,
      );
      if (
        output.kind !== "audio" ||
        revision !== audioRevisionRef.current ||
        audioControllerRef.current !== controller
      ) {
        return;
      }
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(output.bytes)], { type: "audio/wav" }),
      );
      audioUrlRef.current = url;
      const player = new Audio(url);
      audioRef.current = player;
      player.onended = () => {
        if (audioRef.current === player) releaseAudio();
      };
      player.onerror = () => {
        if (audioRef.current === player) releaseAudio();
      };
      await player.play();
      if (
        revision !== audioRevisionRef.current ||
        audioRef.current !== player
      ) {
        player.pause();
        return;
      }
      setIsPreparingAudio(false);
      setIsPlaying(true);
    } catch {
      releaseAudio();
    } finally {
      if (audioControllerRef.current === controller) {
        audioControllerRef.current = null;
      }
    }
  }

  let invalidMessage: string | null = null;
  if (conversion.state === "error") invalidMessage = conversion.message;
  else if (result && !isValid && activeSource === "text") {
    invalidMessage = m["tools.morseCodeConverter.unsupportedTextMessage"]();
  }
  const showAudioStop = isPreparingAudio || isPlaying;

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="flex flex-wrap justify-end gap-3 border-b border-separator">
          <Button type="button" size="sm" variant="ghost" onPress={loadSample}>
            <FileText aria-hidden className="size-4" />
            {m["shared.textAnalysis.example"]()}
          </Button>
          <Button type="button" size="sm" variant="ghost" onPress={clear}>
            <Trash2 aria-hidden className="size-4" />
            {m["shared.textAnalysis.clear"]()}
          </Button>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          <MorseField
            label={m["shared.aesTools.decrypttextplaintextlabel"]()}
            placeholder={m["tools.morseCodeConverter.textPlaceholder"]()}
            value={textInput}
            onChange={changeText}
          />

          <MorseField
            label={m["tools.morseCodeConverter.morseCodeLabel"]()}
            placeholder={m["tools.morseCodeConverter.morsePlaceholder"]()}
            value={morseInput}
            onChange={changeMorse}
            actions={
              isValid ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onPress={showAudioStop ? () => releaseAudio() : play}
                >
                  {showAudioStop ? (
                    <Square aria-hidden className="size-4" />
                  ) : (
                    <Play aria-hidden className="size-4" />
                  )}
                  {showAudioStop
                    ? m["tools.unicodeInvisibleCharacterChecker.utilitystop"]()
                    : m["tools.unicodeInvisibleCharacterChecker.utilityplay"]()}
                </Button>
              ) : null
            }
          />

          {conversion.state === "loading" ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-3"
            >
              <Skeleton className="h-6 w-32 rounded-full" />
              <span className="sr-only">
                {m["tools.morseCodeConverter.localProcessingLabel"]()}
              </span>
            </div>
          ) : isValid ? (
            <div className="flex items-center">
              <Chip size="sm" variant="secondary">
                {m["tools.morseCodeConverter.validLabel"]()}
              </Chip>
            </div>
          ) : invalidMessage ? (
            <Alert status="danger" role="alert">
              <Alert.Indicator>
                <TriangleAlert aria-hidden className="size-5" />
              </Alert.Indicator>
              <Alert.Content>
                {invalidMessage !== invalidMorseCode ? (
                  <Alert.Title>
                    {m["tools.morseCodeConverter.invalidLabel"]()}
                  </Alert.Title>
                ) : null}
                <Alert.Description>{invalidMessage}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.morseCodeConverter.articleWhyTitle"]()}</h2>
        <p>{m["tools.morseCodeConverter.articleWhyBody"]()}</p>
        <h2>{m["tools.morseCodeConverter.article.helpsTitle"]()}</h2>
        <p>{m["tools.morseCodeConverter.articleHelpsBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58EncoderArticleWhenTitle"]()}</h2>
        <p>{m["tools.morseCodeConverter.articleUseBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function MorseCodeConverterPage() {
  return (
    <ToolPage>
      <MorseCodeConverterPageContent />
    </ToolPage>
  );
}

function MorseField({
  actions,
  label,
  onChange,
  placeholder,
  value,
}: {
  actions?: ReactNode;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>{label}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <ToolCopyButton
            value={value}
            copyLabel={m["common.actions.copy"]()}
            copiedLabel={m["common.actions.copied"]()}
            variant="ghost"
          />
        </div>
      </div>
      <TextArea
        aria-label={label}
        value={value}
        rows={6}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="bg-field-background min-h-32 resize-y rounded-xl border border-border font-mono text-sm"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}
