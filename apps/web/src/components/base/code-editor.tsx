import { Button, Skeleton, TextArea } from "@heroui/react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { editor } from "monaco-editor";
// Vite supplies the default export for this static asset/Worker query.
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCodeTheme } from "@/hooks/use-code-theme";
import { m } from "@/paraglide/messages.js";
import { applyCodeTheme, configureMonaco } from "./code-block-highlighter";

type Monaco = Pick<
  typeof import("monaco-editor"),
  "editor" | "languages" | "Uri"
>;

const editorWorkers = new Set<Worker>();
let activeEditorCount = 0;

function configureWorkers() {
  if (typeof self === "undefined") return;
  self.MonacoEnvironment = {
    getWorker(_moduleId, _label) {
      const worker = new EditorWorker();
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        editorWorkers.delete(worker);
        terminate();
      };
      editorWorkers.add(worker);
      return worker;
    },
  };
}

function releaseEditorWorkerIfIdle() {
  activeEditorCount = Math.max(0, activeEditorCount - 1);
  if (activeEditorCount > 0) return;
  // Snapshot the collection before callbacks mutate it.
  for (const worker of [...editorWorkers]) worker.terminate();
}

interface CodeEditorProps {
  embedded?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  language: string;
  modelPath: string;
  "aria-label": string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  height?: number;
  readOnly?: boolean;
}

export function CodeEditor({
  embedded = false,
  title,
  description,
  value,
  onChange,
  language,
  modelPath,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  height = 320,
  readOnly = false,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const theme = useCodeTheme();
  const themeRef = useRef(theme);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  onChangeRef.current = onChange;
  valueRef.current = value;
  themeRef.current = theme;

  useEffect(() => {
    // Exclude browser-only editor imports from the SSR build.
    if (import.meta.env.SSR) return;
    if (typeof Worker !== "function") return;
    setReady(false);
    setLoading(true);
    activeEditorCount++;
    configureWorkers();
    let cancelled = false;
    let model: editor.ITextModel | null = null;
    let instance: editor.IStandaloneCodeEditor | null = null;
    let listener: { dispose(): void } | null = null;
    void Promise.all([
      import("monaco-editor/editor/editor.api"),
      import(
        "monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens"
      ),
      import(
        "monaco-editor/editor/contrib/semanticTokens/browser/viewportSemanticTokens"
      ),
    ])
      .then(([monaco]) => {
        if (cancelled || !containerRef.current) return;
        monacoRef.current = monaco;
        configureMonaco(monaco, () => themeRef.current);
        if (!monaco.languages.getLanguages().some(({ id }) => id === language))
          monaco.languages.register({ id: language });
        const uri = monaco.Uri.parse(modelPath);
        model = monaco.editor.createModel(valueRef.current, language, uri);
        instance = monaco.editor.create(containerRef.current, {
          ariaLabel,
          automaticLayout: true,
          fontSize: 14,
          minimap: { enabled: false },
          model,
          padding: { top: 12, bottom: 12 },
          readOnly,
          scrollBeyondLastLine: false,
          "semanticHighlighting.enabled": true,
          tabSize: 2,
          theme: themeRef.current === "dark" ? "vs-dark" : "vs",
          wordWrap: "on",
        });
        editorRef.current = instance;
        listener = instance.onDidChangeModelContent(() => {
          onChangeRef.current(instance?.getValue() ?? "");
        });
        void applyCodeTheme(monaco, themeRef.current).catch(() => {});
        setReady(true);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      listener?.dispose();
      instance?.dispose();
      model?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
      releaseEditorWorkerIfIdle();
    };
  }, [ariaLabel, language, modelPath, readOnly]);

  useEffect(() => {
    const instance = editorRef.current;
    if (instance && instance.getValue() !== value) instance.setValue(value);
  }, [value]);

  useEffect(() => {
    if (monacoRef.current)
      void applyCodeTheme(monacoRef.current, theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    if (!fullscreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullscreen]);

  return (
    <section
      className={`${fullscreen ? "fixed inset-0 z-50 bg-background p-3 sm:p-6" : ""} min-w-0`}
      aria-describedby={ariaDescribedBy}
      data-code-editor=""
      data-fullscreen={fullscreen || undefined}
    >
      <div
        className={`flex min-w-0 flex-col overflow-hidden ${embedded && !fullscreen ? "" : "rounded-xl border border-field-border shadow-field"} bg-(--field-background) transition-[border-color,box-shadow] duration-200 focus-within:border-field-border-focus focus-within:ring-2 focus-within:ring-focus/25 hover:border-field-border-hover aria-invalid:border-danger aria-invalid:ring-danger/20 ${fullscreen ? "h-full" : ""}`}
        aria-invalid={ariaInvalid}
      >
        <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-end gap-3 border-b border-separator bg-default/45 px-3 py-2">
          {title || description ? (
            <div className="min-w-0 flex-1">
              {title ? (
                <div className="text-sm font-medium text-foreground">
                  {title}
                </div>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-muted">{description}</p>
              ) : null}
            </div>
          ) : null}
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={
              fullscreen
                ? m["common.editorexitfullscreen"]()
                : m["common.editorfullscreen"]()
            }
            onPress={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? (
              <Minimize2 aria-hidden className="size-4" />
            ) : (
              <Maximize2 aria-hidden className="size-4" />
            )}
          </Button>
        </div>
        <div
          className={`relative min-w-0 overflow-hidden bg-(--field-background) ${fullscreen ? "flex-1" : "shrink-0"}`}
          style={{ height: fullscreen ? undefined : height }}
        >
          <div
            ref={containerRef}
            className={ready ? "h-full w-full" : "hidden"}
          />
          {!ready ? (
            <>
              <TextArea
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid}
                className="h-full w-full resize-none rounded-none border-0 bg-transparent font-mono shadow-none outline-none"
                value={value}
                readOnly={readOnly}
                onChange={(event) => onChange(event.target.value)}
              />
              {loading ? (
                <Skeleton
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-none"
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
