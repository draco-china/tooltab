import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Modal, useOverlayState } from "@heroui/react";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { m } from "@/paraglide/messages.js";
import {
  generateNumbers,
  RandomNumberError,
  type RandomNumberOptions,
  randomDefaults,
  randomPresets,
  randomRange,
} from "@workspace/tools/number/random";
import type { HistoryEntry } from "./types";
import { FullscreenContent, HistoryCard, OptionsCard, ResultsCard } from "./ui";

const ROLLING_INTERVAL_MS = 80;
const AUTO_DRAW_DEBOUNCE_MS = 180;
const STORAGE_KEYS = {
  min: "tools:random-number-generator:min",
  max: "tools:random-number-generator:max",
  count: "tools:random-number-generator:count",
  allowRepeat: "tools:random-number-generator:allow-repeat",
  numberType: "tools:random-number-generator:number-type",
  decimalPlaces: "tools:random-number-generator:decimal-places",
  history: "tools:random-number-generator:history",
} as const;

function parseHistory(value: string | null): HistoryEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as { id?: unknown; values?: unknown };
      return typeof candidate.id === "string" &&
        Array.isArray(candidate.values) &&
        candidate.values.every((item) => typeof item === "string")
        ? [{ id: candidate.id, values: [...candidate.values] }]
        : [];
    });
  } catch {
    return [];
  }
}

function addHistoryEntry(history: HistoryEntry[], values: string[]) {
  if (!values.length || history[0]?.values.join("\n") === values.join("\n"))
    return history;
  return [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      values: [...values],
    },
    ...history,
  ].slice(0, 20);
}

function RandomNumberGeneratorContent() {
  const fieldIds = {
    min: useId(),
    max: useId(),
    count: useId(),
    decimalPlaces: useId(),
  };
  const fullscreenState = useOverlayState();
  const [hydrated, setHydrated] = useState(false);
  const [options, setOptions] = useState<RandomNumberOptions>(randomDefaults);
  const [values, setValues] = useState<string[]>([]);
  const [entropyError, setEntropyError] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const optionsRef = useRef(options);
  const valuesRef = useRef(values);
  const rollingRef = useRef(false);
  const initializedRef = useRef(false);
  const autoDrawTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const closeFullscreenRef = useRef(fullscreenState.close);
  optionsRef.current = options;
  valuesRef.current = values;
  closeFullscreenRef.current = fullscreenState.close;

  const validation = useMemo(() => {
    try {
      const range = randomRange({ ...options, allowRepeat: true }).size;
      return {
        range: range.toString(),
        error:
          !options.allowRepeat && BigInt(options.count) > range ? "count" : "",
      };
    } catch {
      return {
        range: "0",
        error: "range",
      };
    }
  }, [options]);
  const activeError =
    validation.error === "count"
      ? m["tools.randomNumberGenerator.countError"]({
          range: validation.range,
        })
      : validation.error
        ? m["tools.randomNumberGenerator.rangeError"]()
        : entropyError
          ? m["tools.randomNumberGenerator.randomError"]()
          : "";
  const canRoll = !validation.error;
  const outputText = values.join("\n");

  const stopRolling = useCallback((commit: boolean) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (!rollingRef.current) return;
    rollingRef.current = false;
    lastTickRef.current = 0;
    setRolling(false);
    if (commit)
      setHistory((current) => addHistoryEntry(current, valuesRef.current));
  }, []);

  const draw = useCallback(
    (drawOptions?: RandomNumberOptions) => {
      try {
        const next = generateNumbers(drawOptions ?? optionsRef.current).values;
        valuesRef.current = next;
        setEntropyError(false);
        startTransition(() => setValues(next));
        return next;
      } catch (error) {
        valuesRef.current = [];
        setValues([]);
        setEntropyError(
          error instanceof RandomNumberError &&
            error.code === "random_unavailable",
        );
        stopRolling(false);
        closeFullscreenRef.current();
        return [];
      }
    },
    [stopRolling],
  );

  useEffect(() => {
    try {
      const min = localStorage.getItem(STORAGE_KEYS.min);
      const max = localStorage.getItem(STORAGE_KEYS.max);
      const storedCount = localStorage.getItem(STORAGE_KEYS.count);
      const storedDecimalPlaces = localStorage.getItem(
        STORAGE_KEYS.decimalPlaces,
      );
      const count = storedCount === null ? Number.NaN : Number(storedCount);
      const decimalPlaces =
        storedDecimalPlaces === null ? Number.NaN : Number(storedDecimalPlaces);
      const numberType = localStorage.getItem(STORAGE_KEYS.numberType);
      const allowRepeat = localStorage.getItem(STORAGE_KEYS.allowRepeat);
      setOptions({
        min: min ?? randomDefaults.min,
        max: max ?? randomDefaults.max,
        count:
          Number.isInteger(count) && count >= 1 && count <= 100
            ? count
            : randomDefaults.count,
        decimalPlaces:
          Number.isInteger(decimalPlaces) &&
          decimalPlaces >= 0 &&
          decimalPlaces <= 6
            ? decimalPlaces
            : randomDefaults.decimalPlaces,
        numberType:
          numberType === "decimal" || numberType === "integer"
            ? numberType
            : randomDefaults.numberType,
        allowRepeat:
          allowRepeat === null
            ? randomDefaults.allowRepeat
            : allowRepeat === "true",
      });
      setHistory(parseHistory(localStorage.getItem(STORAGE_KEYS.history)));
    } catch {
      // Optional preferences must not block generation.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.min, options.min);
      localStorage.setItem(STORAGE_KEYS.max, options.max);
      localStorage.setItem(STORAGE_KEYS.count, String(options.count));
      localStorage.setItem(
        STORAGE_KEYS.allowRepeat,
        String(options.allowRepeat),
      );
      localStorage.setItem(STORAGE_KEYS.numberType, options.numberType);
      localStorage.setItem(
        STORAGE_KEYS.decimalPlaces,
        String(options.decimalPlaces),
      );
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    } catch {
      // Storage may be unavailable while the tool remains usable.
    }
  }, [history, hydrated, options]);

  useEffect(() => {
    if (!hydrated) return;
    if (validation.error) {
      valuesRef.current = [];
      setValues([]);
      stopRolling(false);
      closeFullscreenRef.current();
      return;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      draw(options);
      return;
    }
    const timer = window.setTimeout(() => {
      autoDrawTimerRef.current = null;
      if (rollingRef.current) return;
      const next = draw(options);
      if (next.length) setHistory((current) => addHistoryEntry(current, next));
    }, AUTO_DRAW_DEBOUNCE_MS);
    autoDrawTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autoDrawTimerRef.current === timer) autoDrawTimerRef.current = null;
    };
  }, [draw, hydrated, options, stopRolling, validation.error]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rollingRef.current = false;
    },
    [],
  );

  function update<K extends keyof RandomNumberOptions>(
    key: K,
    value: RandomNumberOptions[K],
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }
  function toggleRolling() {
    if (rollingRef.current) return stopRolling(true);
    if (!canRoll) return;
    if (autoDrawTimerRef.current !== null) {
      window.clearTimeout(autoDrawTimerRef.current);
      autoDrawTimerRef.current = null;
    }
    rollingRef.current = true;
    setRolling(true);
    lastTickRef.current = 0;
    draw();
    const tick = (timestamp: number) => {
      if (!rollingRef.current) return;
      if (!lastTickRef.current) lastTickRef.current = timestamp;
      else if (timestamp - lastTickRef.current >= ROLLING_INTERVAL_MS) {
        draw();
        lastTickRef.current = timestamp;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  function download() {
    if (!outputText) return;
    const url = URL.createObjectURL(
      new Blob([outputText], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "random-numbers.txt";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        data-tool-panels
      >
        <OptionsCard
          activeError={activeError}
          fieldIds={fieldIds}
          onPreset={(key) => setOptions({ ...randomPresets[key] })}
          options={options}
          update={update}
        />
        <ResultsCard
          canRoll={canRoll}
          isRolling={rolling}
          onDownload={download}
          onFullscreen={fullscreenState.open}
          onToggleRolling={toggleRolling}
          outputText={outputText}
          values={values}
        />
      </div>
      <HistoryCard history={history} onClear={() => setHistory([])} />
      <ToolArticle>
        <h2>{m["tools.randomNumberGenerator.articleWhatTitle"]()}</h2>
        <p>{m["tools.randomNumberGenerator.articleWhatBody"]()}</p>
        <p>{m["tools.randomNumberGenerator.articlePrivacyBody"]()}</p>
        <h2>{m["tools.randomNumberGenerator.articleTipsTitle"]()}</h2>
        <ul>
          {(
            [
              m["tools.randomNumberGenerator.articleTips0"](),
              m["tools.randomNumberGenerator.articleTips1"](),
              m["tools.randomNumberGenerator.articleTips2"](),
              m["tools.randomNumberGenerator.articleTips3"](),
            ] as const
          ).map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </ToolArticle>
      <Modal.Backdrop
        isOpen={fullscreenState.isOpen}
        onOpenChange={fullscreenState.setOpen}
      >
        <Modal.Container className="h-dvh w-screen max-w-none rounded-none sm:max-w-none">
          <Modal.Dialog className="flex h-full min-h-0 flex-col items-center justify-center gap-8 overflow-auto p-6">
            <Modal.Heading className="sr-only">
              {m["common.passresultstitle"]()}
            </Modal.Heading>
            <FullscreenContent
              canRoll={canRoll}
              isRolling={rolling}
              onClose={fullscreenState.close}
              onToggleRolling={toggleRolling}
              values={values}
            />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

export default function RandomNumberGenerator() {
  return (
    <ToolPage>
      <RandomNumberGeneratorContent />
    </ToolPage>
  );
}
