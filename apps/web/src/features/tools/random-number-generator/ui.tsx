import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ScrollShadow,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  Download,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { m } from "@/paraglide/messages.js";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import type {
  RandomNumberOptions,
  randomPresets,
} from "@workspace/tools/number/random";
import type { HistoryEntry } from "./types";

type Update = <K extends keyof RandomNumberOptions>(
  key: K,
  value: RandomNumberOptions[K],
) => void;

export function OptionsCard({
  activeError,
  fieldIds,
  onPreset,
  options,
  update,
}: Readonly<{
  activeError: string;
  fieldIds: Record<"min" | "max" | "count" | "decimalPlaces", string>;
  onPreset: (key: keyof typeof randomPresets) => void;
  options: RandomNumberOptions;
  update: Update;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.jsonSchemaTools.options"]()}</Card.Title>
        <Card.Description>
          {m["tools.randomNumberGenerator.optionsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <div className="grid gap-3">
          <p className="text-sm font-medium text-muted">
            {m["tools.sitemapXmlGenerator.seopresets"]()}
          </p>
          <ToolPanelActionGroup>
            {(
              [
                ["dice", m["tools.randomNumberGenerator.presetDiceLabel"]()],
                ["ten", m["tools.randomNumberGenerator.presetTenLabel"]()],
                [
                  "hundred",
                  m["tools.randomNumberGenerator.presetHundredLabel"](),
                ],
                ["lotto", m["tools.randomNumberGenerator.presetLottoLabel"]()],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                variant="secondary"
                onPress={() => onPreset(key)}
              >
                {label}
              </Button>
            ))}
          </ToolPanelActionGroup>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            id={fieldIds.min}
            label={m["tools.randomNumberGenerator.minLabel"]()}
            step={inputStep(options)}
            value={options.min}
            onChange={(value) => update("min", value)}
          />
          <NumberField
            id={fieldIds.max}
            label={m["tools.randomNumberGenerator.maxLabel"]()}
            step={inputStep(options)}
            value={options.max}
            onChange={(value) => update("max", value)}
          />
        </div>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <TextField>
            <Label htmlFor={fieldIds.count}>
              {m["tools.cuid2Generator.countLabel"]()}
            </Label>
            <Input
              id={fieldIds.count}
              inputMode="numeric"
              max={100}
              min={1}
              step={1}
              type="number"
              value={options.count}
              onChange={(event) =>
                update("count", boundedInteger(event.target.value, 1, 100))
              }
            />
          </TextField>
          <div className="grid min-h-16 content-between gap-2">
            <Label htmlFor={`${fieldIds.count}-repeat`}>
              {m["tools.randomNumberGenerator.allowRepeatLabel"]()}
            </Label>
            <Switch
              aria-label={m["tools.randomNumberGenerator.allowRepeatLabel"]()}
              id={`${fieldIds.count}-repeat`}
              isSelected={options.allowRepeat}
              onChange={(selected) => update("allowRepeat", selected === true)}
            >
              <Switch.Content>
                <span className="sr-only">
                  {m["tools.randomNumberGenerator.allowRepeatLabel"]()}
                </span>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>{m["tools.randomNumberGenerator.numberTypeLabel"]()}</Label>
          <ToggleButtonGroup
            aria-label={m["tools.randomNumberGenerator.numberTypeLabel"]()}
            className="justify-start"
            selectedKeys={new Set([options.numberType])}
            selectionMode="single"
            onSelectionChange={(selection) => {
              const value = String([...selection][0] ?? "");
              if (value === "integer" || value === "decimal")
                update("numberType", value);
            }}
          >
            <ToggleButton id="integer">
              {m["tools.randomNumberGenerator.integer"]()}
            </ToggleButton>
            <ToggleButton id="decimal">
              {m["tools.randomNumberGenerator.decimal"]()}
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
        {options.numberType === "decimal" ? (
          <TextField>
            <Label htmlFor={fieldIds.decimalPlaces}>
              {m["tools.randomNumberGenerator.decimalPlacesLabel"]()}
            </Label>
            <Input
              id={fieldIds.decimalPlaces}
              inputMode="numeric"
              max={6}
              min={0}
              step={1}
              type="number"
              value={options.decimalPlaces}
              onChange={(event) =>
                update(
                  "decimalPlaces",
                  boundedInteger(event.target.value, 0, 6),
                )
              }
            />
          </TextField>
        ) : null}
        {activeError ? (
          <Alert role="alert" status="danger">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>{activeError}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function NumberField({
  id,
  label,
  onChange,
  step,
  value,
}: Readonly<{
  id: string;
  label: string;
  onChange: (value: string) => void;
  step: number;
  value: string;
}>) {
  return (
    <TextField>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </TextField>
  );
}

function inputStep(options: RandomNumberOptions) {
  return options.numberType === "decimal" ? 1 / 10 ** options.decimalPlaces : 1;
}

function boundedInteger(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.trunc(parsed)))
    : min;
}

export function ResultsCard({
  canRoll,
  isRolling,
  onDownload,
  onFullscreen,
  onToggleRolling,
  outputText,
  values,
}: Readonly<{
  canRoll: boolean;
  isRolling: boolean;
  onDownload: () => void;
  onFullscreen: () => void;
  onToggleRolling: () => void;
  outputText: string;
  values: string[];
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.randomNumberGenerator.resultsDescription"]()}
        </Card.Description>
        <ToolPanelActionGroup className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <RollingButton
            canRoll={canRoll}
            isRolling={isRolling}
            onPress={onToggleRolling}
          />
          <ToolCopyButton
            copiedLabel={m["common.actions.copied"]()}
            copyLabel={m["common.actions.copyResult"]()}
            value={outputText}
            variant="ghost"
          />
          <Button isDisabled={!outputText} variant="ghost" onPress={onDownload}>
            <Download aria-hidden className="size-4" />
            {m["common.actions.download"]()}
          </Button>
          <Button
            isDisabled={!values.length}
            variant="ghost"
            onPress={onFullscreen}
          >
            <Maximize2 aria-hidden className="size-4" />
            {m["tools.randomNumberGenerator.enterFullscreenLabel"]()}
          </Button>
        </ToolPanelActionGroup>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <Button
          aria-label={m["tools.randomNumberGenerator.enterFullscreenLabel"]()}
          className="flex min-h-52 w-full flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 px-4 py-6 text-center hover:border-accent/40 hover:bg-default/40"
          isDisabled={!values.length}
          variant="ghost"
          onPress={onFullscreen}
        >
          <NumberDisplay
            values={values}
            placeholder={m["tools.randomNumberGenerator.resultsPlaceholder"]()}
          />
        </Button>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

export function FullscreenContent({
  canRoll,
  isRolling,
  onClose,
  onToggleRolling,
  values,
}: Readonly<{
  canRoll: boolean;
  isRolling: boolean;
  onClose: () => void;
  onToggleRolling: () => void;
  values: string[];
}>) {
  return (
    <>
      <NumberDisplay fullscreen values={values} />
      <ToolPanelActionGroup className="justify-center">
        <RollingButton
          canRoll={canRoll}
          isRolling={isRolling}
          onPress={onToggleRolling}
        />
        <Button variant="ghost" onPress={onClose}>
          <Minimize2 aria-hidden className="size-4" />
          {m["tools.randomNumberGenerator.rngclose"]()}
        </Button>
      </ToolPanelActionGroup>
    </>
  );
}

function RollingButton({
  canRoll,
  isRolling,
  onPress,
}: Readonly<{
  canRoll: boolean;
  isRolling: boolean;
  onPress: () => void;
}>) {
  return (
    <Button
      isDisabled={!canRoll && !isRolling}
      variant="secondary"
      onPress={onPress}
    >
      <RefreshCcw
        aria-hidden
        className={`size-4 ${isRolling ? "animate-spin" : ""}`}
      />
      {isRolling
        ? m["tools.randomNumberGenerator.stopRandomLabel"]()
        : m["tools.randomNumberGenerator.startRandomLabel"]()}
    </Button>
  );
}

function NumberDisplay({
  fullscreen = false,
  placeholder,
  values,
}: Readonly<{ fullscreen?: boolean; placeholder?: string; values: string[] }>) {
  if (!values.length)
    return <span className="text-sm text-muted">{placeholder}</span>;
  if (values.length === 1)
    return (
      <span
        className={
          fullscreen
            ? "text-center text-7xl font-semibold tracking-tight break-all sm:text-[9rem]"
            : "text-5xl font-semibold tracking-tight break-all sm:text-7xl"
        }
      >
        {values[0]}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center justify-center gap-3">
      {keyedValues(values).map(({ key, value }) => (
        <span
          key={key}
          className={`inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 font-semibold shadow-xs ${fullscreen ? "min-h-20 min-w-20 text-3xl sm:text-6xl" : "min-h-14 min-w-14 text-2xl sm:text-4xl"}`}
        >
          {value}
        </span>
      ))}
    </span>
  );
}

export function HistoryCard({
  history,
  onClear,
}: Readonly<{
  history: HistoryEntry[];
  onClear: () => void;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
        <div className="grid min-w-0 gap-1">
          <Card.Title>
            {m["tools.randomNumberGenerator.historyTitle"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.randomNumberGenerator.historyDescription"]()}
          </Card.Description>
        </div>
        <Button isDisabled={!history.length} variant="ghost" onPress={onClear}>
          <Trash2 aria-hidden className="size-4" />
          {m["tools.randomNumberGenerator.clearHistoryLabel"]()}
        </Button>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {history.length ? (
          <ScrollShadow
            className="h-[min(24rem,55vh)] rounded-xl border border-border/60 bg-default/10"
            orientation="vertical"
          >
            <ol className="grid gap-3 p-4">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap gap-2 rounded-xl border border-border bg-default/20 px-4 py-3"
                >
                  {keyedValues(entry.values, entry.id).map(({ key, value }) => (
                    <span
                      key={key}
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-border bg-surface px-3 py-1.5 text-lg font-semibold shadow-xs"
                    >
                      {value}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </ScrollShadow>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
            {m["tools.randomNumberGenerator.historyEmptyLabel"]()}
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function keyedValues(values: readonly string[], prefix = "result") {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const occurrence = occurrences.get(value) ?? 0;
    occurrences.set(value, occurrence + 1);
    return { key: `${prefix}-${value}-${occurrence}`, value };
  });
}
