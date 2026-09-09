import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  type ColorValue,
  FieldError,
  Label,
  parseColor,
} from "@heroui/react";

const DEFAULT_PRESETS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
] as const;

export function ToolColorPicker({
  label,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  showLabel = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets?: readonly string[];
  showLabel?: boolean;
}) {
  const color = parseColor(value);
  const select = (next: ColorValue | null) => {
    if (next) onChange(next.toFormat("hex").toString("hex"));
  };

  return (
    <div className="grid gap-2">
      {showLabel ? <Label>{label}</Label> : null}
      <ColorPicker value={color} onChange={select}>
        <ColorPicker.Trigger
          aria-label={label}
          className="bg-field-background flex min-h-11 w-full items-center gap-3 rounded-xl border border-border px-3 transition-colors duration-200 outline-none data-[focus-visible=true]:border-focus data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus/30"
        >
          <ColorSwatch color={color} size="sm" />
          <code className="font-mono text-sm text-foreground uppercase">
            {value}
          </code>
        </ColorPicker.Trigger>
        <ColorPicker.Popover className="max-h-[min(32rem,calc(100dvh-2rem))] min-h-0 w-[min(20rem,calc(100vw-2rem))] gap-3 overflow-y-auto overscroll-contain rounded-3xl p-4 scrollbar-thin">
          <ColorArea
            colorSpace="hsb"
            xChannel="saturation"
            yChannel="brightness"
            aria-label={label}
            className="max-w-full"
          >
            <ColorArea.Thumb />
          </ColorArea>
          <ColorSlider channel="hue" colorSpace="hsb" aria-label={label}>
            <ColorSlider.Track>
              <ColorSlider.Thumb />
            </ColorSlider.Track>
          </ColorSlider>
          <ColorSwatchPicker
            aria-label={label}
            className="justify-center"
            size="xs"
            value={color}
            onChange={select}
          >
            {presets.map((preset) => (
              <ColorSwatchPicker.Item key={preset} color={preset}>
                <ColorSwatchPicker.Swatch />
                <ColorSwatchPicker.Indicator />
              </ColorSwatchPicker.Item>
            ))}
          </ColorSwatchPicker>
          <ColorField fullWidth value={color} onChange={select}>
            <Label>{label}</Label>
            <ColorField.Group variant="secondary">
              <ColorField.Prefix>
                <ColorSwatch color={color} size="sm" />
              </ColorField.Prefix>
              <ColorField.Input />
            </ColorField.Group>
            <FieldError />
          </ColorField>
        </ColorPicker.Popover>
      </ColorPicker>
    </div>
  );
}
