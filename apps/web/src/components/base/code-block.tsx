import { Button } from "@heroui/react";
import { Check, Copy, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useCodeTheme } from "@/hooks/use-code-theme";
import { m } from "@/paraglide/messages.js";
import { highlightCode } from "./code-block-highlighter";
import type { HighlightToken } from "./code-highlighter.types";

type CopyStatus = "idle" | "copied" | "error";

interface CodeBlockProps {
  code: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  statusContent?: ReactNode;
  language?: string;
  children?: ReactNode;
  previewCode?: string;
  className?: string;
  codeClassName?: string;
  copyLabel?: string;
  copiedLabel?: string;
  errorLabel?: string;
  maxHeightClassName?: string;
  wrap?: boolean;
  showLineNumbers?: boolean;
}

/** Read-only code output with shared scrolling, line numbers and copy feedback. */
export function CodeBlock({
  code,
  title,
  description,
  actions,
  statusContent,
  language,
  children,
  previewCode,
  className = "",
  codeClassName = "",
  copyLabel,
  copiedLabel,
  errorLabel,
  maxHeightClassName = "max-h-96",
  wrap = false,
  showLineNumbers = false,
}: CodeBlockProps) {
  const copyRequest = useRef(0);
  const [copyState, setCopyState] = useState<{
    code: string;
    status: CopyStatus;
  }>({ code, status: "idle" });
  const status = copyState.code === code ? copyState.status : "idle";
  const [highlighted, setHighlighted] = useState<HighlightToken[][] | null>(
    null,
  );
  const theme = useCodeTheme();
  const hasCustomContent = children !== undefined;
  const displayCode = previewCode ?? code;
  const lines = showLineNumbers ? displayCode.split("\n") : [];
  const heading = title ?? language;

  useEffect(() => {
    setCopyState({ code, status: "idle" });
    return () => {
      copyRequest.current += 1;
    };
  }, [code]);

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(
      () => setCopyState({ code, status: "idle" }),
      2000,
    );
    return () => window.clearTimeout(timer);
  }, [status, code]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setHighlighted(null);
    if (!language || hasCustomContent) return;
    void highlightCode(displayCode, language, theme, controller.signal)
      .then((value) => {
        if (active) setHighlighted(value);
      })
      .catch(() => {
        if (active) setHighlighted(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [displayCode, language, hasCustomContent, theme]);

  async function copy() {
    const current = ++copyRequest.current;
    setCopyState({ code, status: "idle" });
    try {
      await copyText(code);
      if (current === copyRequest.current)
        setCopyState({ code, status: "copied" });
    } catch {
      if (current === copyRequest.current)
        setCopyState({ code, status: "error" });
    }
  }

  return (
    <div
      className={`group/code-block flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field ${className}`}
      data-code-block=""
    >
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-separator bg-default/45 px-3 py-2">
        <div className="min-w-0 flex-1">
          <span className="block min-w-0 truncate text-sm font-medium text-foreground">
            {heading ?? "Code"}
          </span>
          {description ? (
            <p className="mt-1 text-sm text-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button
            isDisabled={statusContent !== undefined || !code}
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={
              status === "copied"
                ? (copiedLabel ?? m["common.actions.copied"]())
                : status === "error"
                  ? (errorLabel ?? m["common.actions.copyError"]())
                  : (copyLabel ?? m["common.actions.copy"]())
            }
            onPress={() => void copy()}
          >
            {status === "copied" ? (
              <Check aria-hidden className="size-4 text-success" />
            ) : status === "error" ? (
              <X aria-hidden className="size-4 text-danger" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            <span className="sr-only">
              {status === "copied"
                ? (copiedLabel ?? m["common.actions.copied"]())
                : status === "error"
                  ? (errorLabel ?? m["common.actions.copyError"]())
                  : (copyLabel ?? m["common.actions.copy"]())}
            </span>
          </Button>
          {actions}
        </div>
      </div>
      <section
        className={`${maxHeightClassName} min-w-0 overflow-auto overscroll-contain p-4 text-sm leading-6 ${wrap ? "overflow-x-hidden" : ""}`}
        aria-label={
          typeof heading === "string" ? heading : (language ?? "Code")
        }
      >
        {statusContent ?? (
          <pre
            className={
              wrap ? "break-all whitespace-pre-wrap" : "whitespace-pre"
            }
          >
            {showLineNumbers ? (
              <code
                className={`grid min-w-max font-mono ${legacyHighlightClasses} ${codeClassName}`}
              >
                {lines.map((line, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: code lines have no durable identity and contain no state
                  <span className="table-row" key={`${index}-${line}`}>
                    <span
                      aria-hidden
                      className="table-cell pe-4 text-end text-muted select-none"
                    >
                      {index + 1}
                    </span>
                    <span className="table-cell">
                      {highlighted?.[index] ? (
                        <TokenLine tokens={highlighted[index]} />
                      ) : (
                        line || "\u00a0"
                      )}
                    </span>
                  </span>
                ))}
              </code>
            ) : (
              <code
                className={`font-mono ${legacyHighlightClasses} ${codeClassName}`}
              >
                {children ??
                  (highlighted
                    ? highlighted.map((tokens, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: highlighted code lines contain no state
                        <span key={index}>
                          <TokenLine tokens={tokens} />
                          {index < highlighted.length - 1 ? "\n" : null}
                        </span>
                      ))
                    : displayCode)}
              </code>
            )}
          </pre>
        )}
      </section>
    </div>
  );
}

const legacyHighlightClasses =
  "[&_.hljs-attr]:text-accent [&_.hljs-built_in]:text-accent [&_.hljs-comment]:text-muted [&_.hljs-keyword]:text-accent [&_.hljs-literal]:text-warning [&_.hljs-name]:text-accent [&_.hljs-number]:text-warning [&_.hljs-string]:text-success [&_.hljs-title]:text-link";

function TokenLine({ tokens }: { tokens: HighlightToken[] }) {
  if (!tokens.length) return "\u00a0";
  return tokens.map((token, index) => (
    <span
      // biome-ignore lint/suspicious/noArrayIndexKey: immutable syntax tokens contain no state
      key={index}
      style={tokenStyle(token)}
    >
      {token.content}
    </span>
  ));
}

function tokenStyle(token: HighlightToken): CSSProperties {
  const fontStyle = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: fontStyle & 1 ? "italic" : undefined,
    fontWeight: fontStyle & 2 ? 700 : undefined,
    textDecoration: fontStyle & 4 ? "underline" : undefined,
  };
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.insetInlineStart = "-9999px";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    textarea.remove();
  }
}
