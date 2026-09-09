import { Button, InputGroup } from "@heroui/react";
import { Eye, EyeOff, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { m } from "@/paraglide/messages.js";

type ToolPasswordInputProps = Omit<
  ComponentProps<typeof InputGroup.Input>,
  "prefix" | "type"
> & {
  showLabel: string;
  hideLabel: string;
  variant?: "primary" | "secondary";
  groupClassName?: string;
  prefix?: ReactNode;
  clearLabel?: string;
  onClear?: () => void;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
};

export function ToolPasswordInput({
  showLabel,
  hideLabel,
  variant = "secondary",
  groupClassName,
  prefix,
  clearLabel,
  onClear,
  isVisible,
  onVisibilityChange,
  ...inputProps
}: ToolPasswordInputProps) {
  const [internalVisible, setInternalVisible] = useState(false);
  const visible = isVisible ?? internalVisible;
  const setVisible = (next: boolean) => {
    if (isVisible === undefined) setInternalVisible(next);
    onVisibilityChange?.(next);
  };

  return (
    <InputGroup
      variant={variant}
      fullWidth
      className={groupClassName ?? "min-h-11"}
    >
      {prefix ? <InputGroup.Prefix>{prefix}</InputGroup.Prefix> : null}
      <InputGroup.Input {...inputProps} type={visible ? "text" : "password"} />
      <InputGroup.Suffix>
        <span className="flex items-center gap-1">
          {onClear && inputProps.value ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={clearLabel ?? m["common.clear"]()}
              onPress={onClear}
            >
              <X aria-hidden className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={visible ? hideLabel : showLabel}
            aria-pressed={visible}
            onPress={() => setVisible(!visible)}
          >
            {visible ? (
              <EyeOff aria-hidden className="size-4" />
            ) : (
              <Eye aria-hidden className="size-4" />
            )}
          </Button>
        </span>
      </InputGroup.Suffix>
    </InputGroup>
  );
}
