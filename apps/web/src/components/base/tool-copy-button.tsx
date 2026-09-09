import { Button } from "@heroui/react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { m } from "@/paraglide/messages.js";

export function ToolCopyButton({
  value,
  copyLabel,
  copiedLabel,
  errorLabel,
  ariaLabel,
  className,
  disabled = false,
  size = "sm",
  variant = "outline",
}: {
  value: string | Blob;
  copyLabel: string;
  copiedLabel: string;
  errorLabel?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "icon-sm";
  variant?: "default" | "outline" | "secondary" | "ghost";
}) {
  const request = useRef(0);
  const empty = typeof value === "string" ? !value : value.size === 0;
  const [feedback, setFeedback] = useState<{
    value: string | Blob;
    status: "copied" | "error";
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing the copy target or availability invalidates pending clipboard feedback.
  useEffect(() => {
    setFeedback(null);
    return () => {
      request.current += 1;
    };
  }, [value, disabled]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const status = feedback?.value === value ? feedback.status : "idle";

  const label =
    status === "copied"
      ? copiedLabel
      : status === "error"
        ? (errorLabel ?? m["common.actions.copyError"]())
        : copyLabel;
  const Icon =
    status === "copied" ? Check : status === "error" ? CircleAlert : Copy;

  return (
    <Button
      type="button"
      variant={variant === "default" ? "primary" : variant}
      size="sm"
      className={className}
      isIconOnly={size === "icon-sm"}
      isDisabled={disabled || empty}
      aria-label={
        ariaLabel
          ? status === "copied"
            ? `${copiedLabel}: ${ariaLabel}`
            : status === "error"
              ? `${errorLabel ?? m["common.actions.copyError"]()}: ${ariaLabel}`
              : ariaLabel
          : label
      }
      onPress={
        disabled || empty
          ? undefined
          : async () => {
              const current = ++request.current;
              setFeedback(null);
              try {
                const text =
                  typeof value === "string" ? value : await value.text();
                if (current !== request.current) return;
                await navigator.clipboard.writeText(text);
                if (current === request.current)
                  setFeedback({ value, status: "copied" });
              } catch {
                if (current === request.current)
                  setFeedback({ value, status: "error" });
              }
            }
      }
    >
      <Icon aria-hidden className="size-4" />
      {size === "icon-sm" ? <span className="sr-only">{label}</span> : label}
    </Button>
  );
}
