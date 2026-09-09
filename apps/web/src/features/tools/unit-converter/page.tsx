import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  CloseButton,
  Description,
  InputGroup,
  Label,
  ListBox,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { ArrowLeftRight, FileText } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import type { MessageFunction } from "@/lib/message-keys";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  CATEGORIES,
  CATEGORY_IDS,
  convertUnit,
  DEFAULT_PAIRS,
  type PrecisionOption,
  type UnitCategoryId,
  UnitConverterError,
} from "@workspace/tools/number/units";

const unitMessages = {
  kilometer: m["common.unitKilometer"],
  meter: m["common.unitMeter"],
  centimeter: m["common.unitCentimeter"],
  millimeter: m["common.unitMillimeter"],
  micrometer: m["common.unitMicrometer"],
  nanometer: m["common.unitNanometer"],
  mile: m["common.unitMile"],
  yard: m["common.unitYard"],
  foot: m["common.unitFoot"],
  inch: m["common.unitInch"],
  nauticalMile: m["common.unitNauticalMile"],
  tonne: m["common.unitTonne"],
  kilogram: m["common.unitKilogram"],
  gram: m["common.unitGram"],
  milligram: m["common.unitMilligram"],
  microgram: m["common.unitMicrogram"],
  poundMass: m["common.unitPoundMass"],
  ounceMass: m["common.unitOunceMass"],
  stone: m["common.unitStone"],
  shortTon: m["common.unitShortTon"],
  carat: m["common.unitCarat"],
  celsius: m["common.unitCelsius"],
  fahrenheit: m["common.unitFahrenheit"],
  kelvin: m["common.unitKelvin"],
  rankine: m["common.unitRankine"],
  squareKilometer: m["common.unitSquareKilometer"],
  squareMeter: m["common.unitSquareMeter"],
  squareCentimeter: m["common.unitSquareCentimeter"],
  squareMillimeter: m["common.unitSquareMillimeter"],
  hectare: m["common.unitHectare"],
  acre: m["common.unitAcre"],
  squareMile: m["common.unitSquareMile"],
  squareYard: m["common.unitSquareYard"],
  squareFoot: m["common.unitSquareFoot"],
  squareInch: m["common.unitSquareInch"],
  cubicMeter: m["common.unitCubicMeter"],
  liter: m["common.unitLiter"],
  milliliter: m["common.unitMilliliter"],
  cubicFoot: m["common.unitCubicFoot"],
  cubicInch: m["common.unitCubicInch"],
  gallonUs: m["common.unitGallonUs"],
  quartUs: m["common.unitQuartUs"],
  pintUs: m["common.unitPintUs"],
  cupUs: m["common.unitCupUs"],
  fluidOunceUs: m["common.unitFluidOunceUs"],
  tablespoonUs: m["common.unitTablespoonUs"],
  teaspoonUs: m["common.unitTeaspoonUs"],
  gallonImperial: m["common.unitGallonImperial"],
  meterPerSecond: m["common.unitMeterPerSecond"],
  kilometerPerHour: m["common.unitKilometerPerHour"],
  milePerHour: m["common.unitMilePerHour"],
  knot: m["common.unitKnot"],
  footPerSecond: m["common.unitFootPerSecond"],
  bit: m["common.unitBit"],
  byte: m["common.unitByte"],
  kilobyte: m["common.unitKilobyte"],
  megabyte: m["common.unitMegabyte"],
  gigabyte: m["common.unitGigabyte"],
  terabyte: m["common.unitTerabyte"],
  petabyte: m["common.unitPetabyte"],
  kibibyte: m["common.unitKibibyte"],
  mebibyte: m["common.unitMebibyte"],
  gibibyte: m["common.unitGibibyte"],
  tebibyte: m["common.unitTebibyte"],
  pebibyte: m["common.unitPebibyte"],
  nanosecond: m["common.unitNanosecond"],
  microsecond: m["common.unitMicrosecond"],
  millisecond: m["common.unitMillisecond"],
  second: m["tools.cronExpressionParser.unitSecond"],
  minute: m["common.unitMinute"],
  hour: m["common.unitHour"],
  day: m["common.unitDay"],
  week: m["common.unitWeek"],
  month: m["common.unitMonth"],
  year: m["common.unitYear"],
} as const;

const categoryKeys: Record<UnitCategoryId, MessageFunction> = {
  length: m["common.unitcategorylength"],
  mass: m["common.unitcategorymass"],
  temperature: m["common.unitcategorytemperature"],
  area: m["common.unitcategoryarea"],
  volume: m["common.unitcategoryvolume"],
  speed: m["common.unitcategoryspeed"],
  digital: m["common.unitcategorydigital"],
  time: m["common.unitcategorytime"],
};
function initialPairs() {
  return Object.fromEntries(
    CATEGORY_IDS.map((category) => [category, { ...DEFAULT_PAIRS[category] }]),
  ) as Record<
    UnitCategoryId,
    {
      from: string;
      to: string;
    }
  >;
}
const storageKey = "tooltab:unit-converter:v1";
function UnitConverterContent() {
  const id = useId();
  const locale = getLocale();
  const [categoryId, setCategoryId] = useState<UnitCategoryId>("length");
  const [pairs, setPairs] = useState(initialPairs);
  const [value, setValue] = useState("1");
  const [precision, setPrecision] = useState<PrecisionOption>("6");
  const [hasBlurred, setHasBlurred] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const pair = pairs[categoryId];
  const category = CATEGORIES[categoryId];
  const result = useMemo(() => {
    if (!value.trim()) return { value: null, error: null };
    try {
      return {
        value: convertUnit({
          category: categoryId,
          value,
          from: pair.from,
          to: pair.to,
          precision,
          locale,
        }),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof UnitConverterError ? error.code : "invalid_value",
      };
    }
  }, [categoryId, locale, pair.from, pair.to, precision, value]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
        category?: unknown;
        pairs?: unknown;
        precision?: unknown;
        value?: unknown;
      } | null;
      if (
        stored &&
        CATEGORY_IDS.includes(stored.category as UnitCategoryId) &&
        ["4", "6", "10", "max"].includes(String(stored.precision)) &&
        typeof stored.value === "string" &&
        stored.value.length <= 128 &&
        stored.pairs &&
        typeof stored.pairs === "object"
      ) {
        const candidate = stored.pairs as Record<
          string,
          {
            from?: unknown;
            to?: unknown;
          }
        >;
        if (
          CATEGORY_IDS.every((category) => {
            const unitIds = CATEGORIES[category].units.map((unit) => unit.id);
            return (
              unitIds.includes(String(candidate[category]?.from)) &&
              unitIds.includes(String(candidate[category]?.to))
            );
          })
        ) {
          setCategoryId(stored.category as UnitCategoryId);
          setPairs(
            candidate as Record<
              UnitCategoryId,
              {
                from: string;
                to: string;
              }
            >,
          );
          setPrecision(stored.precision as PrecisionOption);
          setValue(stored.value);
        }
      }
    } catch {
      safeLocalStorage.removeItem(storageKey);
    } finally {
      setStorageReady(true);
    }
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ category: categoryId, pairs, precision, value }),
      );
    } catch {
      // Conversion remains available when storage is disabled or full.
    }
  }, [categoryId, pairs, precision, storageReady, value]);
  function patchPair(
    patch: Partial<{
      from: string;
      to: string;
    }>,
  ) {
    setPairs((current) => ({
      ...current,
      [categoryId]: { ...current[categoryId], ...patch },
    }));
  }
  function reset() {
    setCategoryId("length");
    setPairs(initialPairs());
    setValue("1");
    setPrecision("6");
  }
  const unitOptions = category.units.map((unit) => ({
    id: unit.id,
    label: `${unitMessages[unit.id as keyof typeof unitMessages]({})} (${unit.symbol})`,
  }));
  return (
    <div className="grid gap-6" data-tool-panels>
      <ToolPanelCard className="min-w-0">
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <Card.Title>{m["tools.unitConverter.name"]()}</Card.Title>
            <Card.Description>
              {m["tools.unitConverter.description"]()}
            </Card.Description>
          </div>
          <Button variant="ghost" size="sm" onPress={reset}>
            <FileText aria-hidden className="size-4" />
            {m["common.unitsample"]({})}
          </Button>
        </Card.Header>
        <ToolPanelCardContent className="gap-6 py-4">
          <div className="grid gap-2">
            <Label id={`${id}-category-label`}>
              {m["common.unitcategory"]({})}
            </Label>
            <ToggleButtonGroup
              aria-labelledby={`${id}-category-label`}
              selectionMode="single"
              selectedKeys={new Set([categoryId])}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (selected) setCategoryId(String(selected) as UnitCategoryId);
              }}
              isDetached
              className="flex w-full flex-wrap gap-2"
            >
              {CATEGORY_IDS.map((category) => (
                <ToggleButton
                  key={category}
                  id={category}
                  className="border border-border px-3"
                >
                  {categoryKeys[category]({})}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <TextField
              className="grid gap-2"
              isInvalid={Boolean(result.error) && hasBlurred}
            >
              <Label htmlFor={`${id}-value`}>{m["common.unitfrom"]({})}</Label>
              <InputGroup variant="secondary" fullWidth>
                <InputGroup.Input
                  id={`${id}-value`}
                  className="font-mono text-base"
                  value={value}
                  maxLength={128}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  onBlur={() => setHasBlurred(true)}
                  onChange={(event) => setValue(event.target.value)}
                />
                {value ? (
                  <InputGroup.Suffix>
                    <CloseButton
                      aria-label={m["common.unitclear"]({})}
                      onPress={() => setValue("")}
                    />
                  </InputGroup.Suffix>
                ) : null}
              </InputGroup>
              {result.error && hasBlurred ? (
                <Description className="text-danger">
                  {(result.error === "out_of_range"
                    ? m["common.unitoutofrange"]
                    : m["common.unitinvalid"])({})}
                </Description>
              ) : null}
              <UnitSelect
                id={`${id}-from`}
                label={m["common.unitfrom"]({})}
                selectedKey={pair.from}
                options={unitOptions}
                onChange={(next) => patchPair({ from: next })}
              />
            </TextField>

            <Button
              variant="outline"
              isIconOnly
              aria-label={m["common.unitswap"]({})}
              className="rotate-90 self-center justify-self-center sm:rotate-0"
              isDisabled={Boolean(result.error)}
              onPress={() => {
                if (!result.value) return;
                patchPair({ from: pair.to, to: pair.from });
                setValue(result.value.formatted);
              }}
            >
              <ArrowLeftRight aria-hidden className="size-4" />
            </Button>

            <div className="grid gap-2">
              <Label id={`${id}-result-label`}>{m["common.unitto"]({})}</Label>
              <InputGroup variant="secondary" fullWidth>
                <InputGroup.Input
                  aria-labelledby={`${id}-result-label`}
                  className="font-mono text-base tabular-nums"
                  value={result.value?.formatted ?? ""}
                  readOnly
                />
                <InputGroup.Suffix>
                  <ToolCopyButton
                    value={result.value?.formatted ?? ""}
                    copyLabel={m["common.unitcopy"]({})}
                    copiedLabel={m["common.actions.copied"]({})}
                    errorLabel={m["common.unitcopyfailed"]({})}
                    ariaLabel={m["common.unitcopy"]({})}
                    size="icon-sm"
                    variant="ghost"
                  />
                </InputGroup.Suffix>
              </InputGroup>
              <UnitSelect
                id={`${id}-to`}
                label={m["common.unitto"]({})}
                selectedKey={pair.to}
                options={unitOptions}
                onChange={(next) => patchPair({ to: next })}
              />
            </div>
          </div>

          <Select
            variant="secondary"
            className="grid gap-2 sm:w-56"
            selectedKey={precision}
            onSelectionChange={(next) => {
              if (next != null) setPrecision(String(next) as PrecisionOption);
            }}
          >
            <Label>{m["common.unitprecision"]({})}</Label>
            <Select.Trigger id={`${id}-precision`}>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(["4", "6", "10", "max"] as const).map((option) => {
                  const label =
                    option === "max"
                      ? m["common.unitprecisionmax"]({})
                      : `${option} ${m["common.unitdigits"]({})}`;
                  return (
                    <ListBox.Item key={option} id={option} textValue={label}>
                      {label}
                    </ListBox.Item>
                  );
                })}
              </ListBox>
            </Select.Popover>
          </Select>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard className="min-w-0">
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["common.unitall"]({})}</Card.Title>
          <Card.Description>{m["common.unitallhint"]({})}</Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="py-3">
          <ul className="grid gap-1">
            {(result.value?.conversions ?? []).map((conversion) => {
              const active = conversion.id === pair.to;
              return (
                <li
                  key={conversion.id}
                  data-active={active}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-default data-[active=true]:border-border data-[active=true]:bg-default"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    fullWidth
                    aria-pressed={active}
                    className="grid min-w-0 grid-cols-1 gap-x-2 gap-y-1 text-start outline-none sm:grid-cols-2 sm:items-center"
                    onClick={() => patchPair({ to: conversion.id })}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-sm">
                        {unitMessages[
                          conversion.id as keyof typeof unitMessages
                        ]({})}
                      </span>
                      <bdi
                        dir="ltr"
                        className="shrink-0 font-mono text-xs text-muted"
                      >
                        {conversion.symbol}
                      </bdi>
                    </span>
                    <bdi
                      dir="ltr"
                      className="min-w-0 overflow-x-auto text-sm whitespace-nowrap tabular-nums sm:text-end"
                    >
                      {conversion.formatted ||
                        m["common.unitoutofrangeshort"]({})}
                    </bdi>
                  </Button>
                  <ToolCopyButton
                    value={conversion.formatted}
                    copyLabel={m["common.unitcopy"]({})}
                    copiedLabel={m["common.actions.copied"]({})}
                    errorLabel={m["common.unitcopyfailed"]({})}
                    ariaLabel={`${m["common.unitcopy"]({})}: ${unitMessages[conversion.id as keyof typeof unitMessages]({})}`}
                    size="icon-sm"
                    variant="ghost"
                  />
                </li>
              );
            })}
          </ul>
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

function UnitSelect({
  id,
  label,
  selectedKey,
  options,
  onChange,
}: {
  id: string;
  label: string;
  selectedKey: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      aria-label={label}
      selectedKey={selectedKey}
      onSelectionChange={(value) => {
        if (value != null) onChange(String(value));
      }}
    >
      <Label className="sr-only">{label}</Label>
      <Select.Trigger id={id} className="min-h-11">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
            >
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export default function UnitConverter() {
  return (
    <ToolPage>
      <UnitConverterContent />
    </ToolPage>
  );
}
