import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Label, ListBox, Select, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, TriangleAlert } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import { m } from "@/paraglide/messages.js";
import {
  formatJson,
  JsonFormatError,
  type JsonIndent,
  MAX_JSON_LENGTH,
} from "@workspace/tools/json";

const DEFAULT_JSON = `{
  "hello": "world",
  "items": [1, 2, 3],
  "nested": { "a": true, "b": null }
}`;

type FormatResult =
  | { state: "idle"; output: "" }
  | { state: "formatted"; output: string }
  | { state: "error"; output: ""; message: string };

function JsonFormatterContent() {
  const errorId = useId();
  const indentId = useId();
  const fileReaderRef = useRef<FileReader | null>(null);
  const revisionRef = useRef(0);
  const downloadUrlRef = useRef<string | null>(null);
  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [indentSize, setIndentSize] = useState<JsonIndent>("2");
  const [fileError, setFileError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredJsonText = useDeferredValue(jsonText);
  const isPending = deferredJsonText !== jsonText;
  const result = useMemo<FormatResult>(() => {
    if (!deferredJsonText.trim()) return { state: "idle", output: "" };
    try {
      return {
        state: "formatted",
        output: formatJson(deferredJsonText, indentSize),
      };
    } catch (error) {
      return {
        state: "error",
        output: "",
        message:
          error instanceof JsonFormatError
            ? (error.detail ?? error.message)
            : error instanceof Error
              ? error.message
              : "Unknown error",
      };
    }
  }, [deferredJsonText, indentSize]);

  useEffect(
    () => () => {
      revisionRef.current++;
      fileReaderRef.current?.abort();
      fileReaderRef.current = null;
      revokeDownloadUrl(downloadUrlRef);
    },
    [],
  );

  function changeJsonText(value: string) {
    revisionRef.current++;
    fileReaderRef.current?.abort();
    fileReaderRef.current = null;
    revokeDownloadUrl(downloadUrlRef);
    setDownloadUrl("");
    setFileError("");
    setJsonText(value);
  }

  async function importFile(file: File) {
    fileReaderRef.current?.abort();
    const revision = ++revisionRef.current;
    revokeDownloadUrl(downloadUrlRef);
    setDownloadUrl("");
    setFileError("");
    let reader: FileReader | null = null;
    try {
      if (file.size > MAX_JSON_LENGTH * 4) throw new Error("too-large");
      const nextReader = new FileReader();
      reader = nextReader;
      fileReaderRef.current = nextReader;
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        nextReader.onload = () => {
          if (nextReader.result instanceof ArrayBuffer)
            resolve(nextReader.result);
          else reject(new Error("read-failed"));
        };
        nextReader.onerror = () =>
          reject(nextReader.error ?? new Error("read-failed"));
        nextReader.onabort = () =>
          reject(new DOMException("Aborted", "AbortError"));
        nextReader.readAsArrayBuffer(file);
      });
      if (fileReaderRef.current === nextReader) fileReaderRef.current = null;
      const value = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (revision !== revisionRef.current) return;
      if (value.length > MAX_JSON_LENGTH) throw new Error("too-large");
      startTransition(() => setJsonText(value));
    } catch {
      if (fileReaderRef.current === reader) fileReaderRef.current = null;
      if (revision === revisionRef.current) {
        setFileError(m["tools.jmespathTester.invalidJsonLabel"]());
      }
    }
  }

  useEffect(() => {
    revokeDownloadUrl(downloadUrlRef);
    if (result.state !== "formatted" || fileError || isPending) {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([result.output], { type: "application/json;charset=utf-8" }),
    );
    downloadUrlRef.current = url;
    setDownloadUrl(url);
  }, [fileError, isPending, result]);

  return (
    <div
      className="flex min-w-0 flex-col gap-6 **:data-[slot=input]:min-h-11"
      data-tool="json-formatter"
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-2" data-tool-panels>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="relative">
            <CodeEditor
              embedded
              title={m["tools.dnsLookup.rawJson"]()}
              description={m["tools.jsonFormatter.rawJsonDescription"]()}
              aria-label={m["tools.dnsLookup.rawJson"]()}
              aria-describedby={
                result.state === "error" || fileError ? errorId : undefined
              }
              aria-invalid={result.state === "error" || Boolean(fileError)}
              language="json"
              modelPath="tooltab://json-formatter/input.json"
              height={320}
              value={jsonText}
              onChange={changeJsonText}
            />
            {!jsonText ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
              >
                {m["tools.jsonFormatter.input.placeholder"]()}
              </span>
            ) : null}
          </div>
          <div className="border-t border-separator p-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m["tools.jsonFormatter.rawJsonDescription"]()}
              accept={[".json", ".txt", "application/json", "text/plain"]}
              onSelect={(file) => void importFile(file)}
            />
          </div>
          <section
            aria-labelledby={`${errorId}-options`}
            className="grid gap-4 border-t border-separator p-3"
          >
            <div>
              <h2
                id={`${errorId}-options`}
                className="text-sm font-medium text-foreground"
              >
                {m["tools.jsonFormatter.indent.label"]()}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {m["tools.jsonFormatter.output.description"]()}
              </p>
            </div>
            <Select
              variant="secondary"
              selectedKey={indentSize}
              onSelectionChange={(key) => {
                if (key != null) setIndentSize(String(key) as JsonIndent);
              }}
            >
              <Label>{m["tools.jsonFormatter.indent.label"]()}</Label>
              <Select.Trigger id={indentId}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {["1", "2", "3", "4", "5", "6", "7", "8"].map((value) => (
                    <ListBox.Item key={value} id={value} textValue={value}>
                      {value}
                    </ListBox.Item>
                  ))}
                  <ListBox.Item
                    id="tab"
                    textValue={m["tools.jsonFormatter.tab"]()}
                  >
                    {m["tools.jsonFormatter.tab"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="compact"
                    textValue={m["tools.jsonFormatter.compact"]()}
                  >
                    {m["tools.jsonFormatter.compact"]()}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </section>
        </div>

        <CodeBlock
          code={result.state === "formatted" ? result.output : ""}
          title={m["tools.jsonFormatter.output.label"]()}
          description={m["tools.jsonFormatter.output.description"]()}
          language="json"
          copyLabel={m["shared.aesTools.encryptcopyjsonlabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          className="h-full"
          maxHeightClassName="min-h-80 max-h-[32rem]"
          previewCode={
            result.state === "formatted"
              ? result.output.slice(0, 100_000)
              : undefined
          }
          actions={
            result.state === "formatted" && downloadUrl ? (
              <a
                href={downloadUrl}
                download="formatted.json"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <Download aria-hidden className="size-4" />
                {m["common.httptDownload"]()}
              </a>
            ) : (
              <Button size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["common.httptDownload"]()}
              </Button>
            )
          }
          statusContent={
            isPending ? (
              <OutputSkeleton label={m["tools.jsonFormatter.output.label"]()} />
            ) : result.state === "error" || fileError ? (
              <Alert status="danger" role="alert" id={errorId}>
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.jmespathTester.invalidJsonLabel"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {fileError ||
                      (result.state === "error" ? result.message : "")}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result.state === "formatted" ? undefined : (
              <section
                aria-label={m["tools.jsonFormatter.output.label"]()}
                className="flex min-h-80 items-center justify-center px-5 text-center text-sm text-muted"
              >
                {m["tools.jsonFormatter.empty"]()}
              </section>
            )
          }
        />
      </div>

      <JsonFormatterArticle />
    </div>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-80 content-start gap-3"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function JsonFormatterArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
      <p>{m["tools.jsonFormatter.articlePurposeBody"]()}</p>
      <h2>{m["tools.currentNetworkTime.article.helpsTitle"]()}</h2>
      <ul>
        <li>{m["tools.jsonFormatter.articleHelpsItems0"]()}</li>
        <li>{m["tools.jsonFormatter.articleHelpsItems1"]()}</li>
        <li>{m["tools.jsonFormatter.articleHelpsItems2"]()}</li>
      </ul>
      <h2>{m["tools.currentNetworkTime.article.watchTitle"]()}</h2>
      <ul>
        <li>{m["tools.jsonFormatter.articleWatchItems0"]()}</li>
        <li>{m["tools.jsonFormatter.articleWatchItems1"]()}</li>
        <li>{m["tools.jsonFormatter.articleWatchItems2"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function revokeDownloadUrl(ref: { current: string | null }) {
  if (!ref.current) return;
  URL.revokeObjectURL(ref.current);
  ref.current = null;
}

export default function JsonFormatter() {
  return (
    <ToolPage>
      <JsonFormatterContent />
    </ToolPage>
  );
}
