import { Button } from "@heroui/react";
import { FileUp, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { m } from "@/paraglide/messages.js";

type ToolFilePickerProps = {
  label: string;
  accept?: string[];
  fileName?: string;
  description?: string;
  clearLabel?: string;
  isDisabled?: boolean;
  inputTestId?: string;
  multiple?: boolean;
  onSelect?: (file: File) => void;
  onSelectFiles?: (files: File[]) => void;
  onClear?: () => void;
};

export function ToolFilePicker({
  label,
  accept,
  fileName,
  description,
  clearLabel,
  isDisabled = false,
  inputTestId,
  multiple = false,
  onSelect,
  onSelectFiles,
  onClear,
}: ToolFilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const selectFiles = (files: File[]) => {
    if (!files.length) return;
    if (multiple) onSelectFiles?.(files);
    else if (files[0]) onSelect?.(files[0]);
  };
  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        id={inputId}
        aria-label={label}
        className="hidden"
        type="file"
        accept={accept?.join(",")}
        multiple={multiple}
        disabled={isDisabled}
        data-testid={inputTestId}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          selectFiles(files);
        }}
      />
      {/* File dropping supplements the labeled keyboard-accessible picker button. */}
      <fieldset
        className="group"
        data-source-dropzone={label}
        data-drop-target={isDropTarget || undefined}
        onDragEnter={(event) => {
          if (!isDisabled && event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setIsDropTarget(true);
          }
        }}
        onDragOver={(event) => {
          if (!isDisabled && event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setIsDropTarget(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDropTarget(false);
          if (isDisabled) return;
          selectFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Button
          type="button"
          variant="outline"
          fullWidth
          isDisabled={isDisabled}
          aria-controls={inputId}
          className="group bg-field-background min-h-28 flex-col gap-2 rounded-2xl border-dashed px-4 py-5 text-center whitespace-normal group-data-drop-target:border-accent group-data-drop-target:bg-accent-soft"
          onPress={() => inputRef.current?.click()}
        >
          <FileUp aria-hidden className="size-5 text-muted" />
          <span>{label}</span>
          {description ? (
            <span className="text-xs text-muted">{description}</span>
          ) : null}
        </Button>
      </fieldset>
      {fileName ? (
        <div className="flex min-w-0 items-center justify-between gap-3 text-sm text-muted">
          <span className="truncate">{fileName}</span>
          {onClear ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={clearLabel ?? m["common.clear"]()}
              onPress={onClear}
            >
              <X aria-hidden className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
