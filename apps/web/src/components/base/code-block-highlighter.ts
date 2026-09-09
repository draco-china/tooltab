import type { CancellationToken, editor } from "monaco-editor";
import type {
  CodeTheme,
  HighlightToken,
  HighlightWorkerInput,
  HighlightWorkerResponse,
  MonacoThemeData,
} from "./code-highlighter.types";

const tokenTypes = Array.from({ length: 64 }, (_, index) => `shiki${index}`);
const tokenModifiers = ["italic", "bold", "underline"];
let worker: Worker | null = null;
let workerIdleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 0;
type Monaco = Pick<typeof import("monaco-editor"), "editor" | "languages">;
let configuredMonaco: Monaco | null = null;
let currentTheme: CodeTheme = "light";
const pending = new Map<
  number,
  {
    resolve: (value: HighlightWorkerResponse) => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  }
>();
const highlightCache = new Map<string, HighlightToken[][]>();
const themeCache = new Map<CodeTheme, MonacoThemeData>();

export async function highlightCode(
  code: string,
  language: string,
  theme: CodeTheme,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const key = `${theme}\0${language}\0${code}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;
  const response = await request(
    { kind: "highlight", code, language, theme },
    signal,
  );
  if (response.kind !== "highlight")
    throw new Error("Invalid highlight response");
  if (highlightCache.size >= 50)
    highlightCache.delete(highlightCache.keys().next().value ?? "");
  highlightCache.set(key, response.lines);
  return response.lines;
}

export function configureMonaco(monaco: Monaco, getTheme: () => CodeTheme) {
  currentTheme = getTheme();
  if (configuredMonaco === monaco) return;
  configuredMonaco = monaco;
  monaco.languages.registerDocumentSemanticTokensProvider("*", {
    getLegend: () => ({ tokenTypes, tokenModifiers }),
    async provideDocumentSemanticTokens(
      model: editor.ITextModel,
      _lastResultId: string | null,
      cancellation: CancellationToken,
    ) {
      try {
        const response = await request({
          kind: "tokens",
          code: model.getValue(),
          language: model.getLanguageId(),
          theme: currentTheme,
        });
        return {
          data:
            cancellation.isCancellationRequested || response.kind !== "tokens"
              ? new Uint32Array()
              : new Uint32Array(response.data),
        };
      } catch {
        return { data: new Uint32Array() };
      }
    },
    releaseDocumentSemanticTokens: () => {},
  });
}

export async function applyCodeTheme(monaco: Monaco, theme: CodeTheme) {
  currentTheme = theme;
  let base = themeCache.get(theme);
  if (!base) {
    const response = await request({ kind: "theme", theme });
    if (response.kind !== "theme") throw new Error("Invalid theme response");
    base = response.theme;
    themeCache.set(theme, base);
  }
  if (theme !== currentTheme) return;
  const name = `tooltab-${theme}`;
  monaco.editor.defineTheme(name, {
    ...base,
    rules: [
      ...base.rules,
      ...base.semanticColors.map((foreground, index) => ({
        token: tokenTypes[index],
        foreground,
      })),
    ],
    colors: {
      ...base.colors,
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
    },
  });
  monaco.editor.setTheme(name);
}

function request(input: HighlightWorkerInput, signal?: AbortSignal) {
  if (typeof Worker !== "function")
    return Promise.reject(new Error("Workers unavailable"));
  signal?.throwIfAborted();
  const id = ++nextId;
  return new Promise<HighlightWorkerResponse>((resolve, reject) => {
    const abort = () => {
      const request = takeRequest(id);
      if (!request) return;
      request.reject(new DOMException("Aborted", "AbortError"));
      if (pending.size === 0) releaseWorker();
    };
    const timer = setTimeout(() => {
      const request = takeRequest(id);
      if (!request) return;
      request.reject(new Error("Syntax highlighting timed out"));
      if (pending.size === 0) releaseWorker();
    }, 30_000);
    pending.set(id, {
      resolve,
      reject,
      cleanup: () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      },
    });
    signal?.addEventListener("abort", abort, { once: true });
    try {
      getWorker().postMessage({ ...input, id });
    } catch {
      const request = takeRequest(id);
      request?.reject(new Error("Syntax highlighting worker failed"));
      if (pending.size === 0) releaseWorker();
    }
  });
}

function getWorker() {
  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer);
    workerIdleTimer = null;
  }
  if (worker) return worker;
  worker = new Worker(
    new URL("./code-block-highlighter.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = ({ data }: MessageEvent<HighlightWorkerResponse>) => {
    const request = takeRequest(data.id);
    if (!request) return;
    if (data.kind === "error") request.reject(new Error(data.error));
    else request.resolve(data);
    scheduleWorkerRelease();
  };
  worker.onerror = () => {
    const error = new Error("Syntax highlighting worker failed");
    for (const request of pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    pending.clear();
    releaseWorker();
  };
  return worker;
}

function scheduleWorkerRelease() {
  if (pending.size > 0 || !worker) return;
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  workerIdleTimer = setTimeout(() => {
    if (pending.size === 0) releaseWorker();
  }, 1000);
}

function takeRequest(id: number) {
  const request = pending.get(id);
  if (!request) return null;
  pending.delete(id);
  request.cleanup();
  return request;
}

function releaseWorker() {
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  workerIdleTimer = null;
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
  worker = null;
}
