import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Accordion, Button, Input, Skeleton, Switch } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import { m } from "@/paraglide/messages.js";
import {
  type JsonOptions,
  jsonDefaults,
  MAX_XML_INPUT,
  XmlJsonError,
  type XmlOptions,
  xmlDefaults,
} from "@workspace/tools/encoding/xml-json";
import { runXmlJsonWorker } from "../xml-json/worker-client";
export function XmlJsonConverter({
  from,
  to,
}: {
  from: "json" | "xml";
  to: "json" | "xml";
}) {
  const id = useId();
  const [input, setInput] = useState(
    from === "json"
      ? '{"project":{"name":"ToolTab","items":[1,2]}}'
      : '<project name="ToolTab"><item>1</item><item>2</item></project>',
  );
  const [options, setOptions] = useState<Partial<JsonOptions & XmlOptions>>(
    from === "json" ? jsonDefaults : xmlDefaults,
  );
  const [output, setOutput] = useState("");
  const [error, setError] = useState<XmlJsonError | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const task = useRef<AbortController | null>(null),
    download = useRef(""),
    reader = useRef<FileReader | null>(null),
    revision = useRef(0);
  function clear() {
    revision.current++;
    reader.current?.abort();
    reader.current = null;
    task.current?.abort();
    task.current = null;
    setBusy(false);
    setOutput("");
    setError(null);
    if (download.current) URL.revokeObjectURL(download.current);
    download.current = "";
    setUrl("");
  }
  useEffect(
    () => () => {
      revision.current++;
      reader.current?.abort();
      task.current?.abort();
      task.current = null;
      if (download.current) URL.revokeObjectURL(download.current);
    },
    [],
  );
  async function convert() {
    clear();
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    try {
      const result = await runXmlJsonWorker(
        {
          input,
          direction: from === "json" ? "json-to-xml" : "xml-to-json",
          options,
        },
        controller.signal,
      );
      if (task.current !== controller) return;
      setOutput(result.output);
      download.current = URL.createObjectURL(
        new Blob([result.output], { type: "text/plain;charset=utf-8" }),
      );
      setUrl(download.current);
    } catch (cause) {
      if (task.current === controller && !controller.signal.aborted)
        setError(
          cause instanceof XmlJsonError
            ? cause
            : new XmlJsonError("invalid_input"),
        );
    } finally {
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div
      className="flex min-w-0 flex-col gap-6 **:data-[slot=button]:min-h-11 **:data-[slot=input]:min-h-11"
      data-tool="xml-to-json-converter"
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-2" data-tool-panels>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="relative">
            <CodeEditor
              embedded
              title={`${m["tools.xmlToJsonConverter.structuredinput"]()} · ${from.toUpperCase()}`}
              description={m["tools.xmlToJsonConverter.structuredlimit"]()}
              aria-label={`${m["tools.xmlToJsonConverter.structuredinput"]()} · ${from.toUpperCase()}`}
              language={from}
              modelPath={`tooltab://xml-json/${from}-to-${to}.${from}`}
              value={input.slice(0, 100000)}
              readOnly={input.length > 100000}
              onChange={(value) => {
                clear();
                setInput(value);
              }}
              height={320}
            />
            <Accordion>
              <Accordion.Item id="options">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    {m["tools.xmlToJsonConverter.jsonoptions"]()}
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="grid gap-4 sm:grid-cols-2">
                    {from === "json" &&
                      (["rootElementName", "arrayItemTag"] as const).map(
                        (key) => (
                          <div key={key} className="grid gap-2">
                            <label htmlFor={`${id}-${key}`}>
                              {(key === "rootElementName"
                                ? m["shared.xmlJson.root"]
                                : m["shared.xmlJson.item"])({})}
                            </label>
                            <Input
                              id={`${id}-${key}`}
                              value={options[key] ?? ""}
                              onChange={(e) => {
                                clear();
                                setOptions((v) => ({
                                  ...v,
                                  [key]: e.target.value,
                                }));
                              }}
                            />
                          </div>
                        ),
                      )}
                    <div className="grid gap-2">
                      <label htmlFor={`${id}-indent`}>
                        {m["tools.xmlToJsonConverter.jsonindent"]()}
                      </label>
                      <Input
                        id={`${id}-indent`}
                        type="number"
                        min={0}
                        max={8}
                        value={options.indentSize ?? 2}
                        onChange={(e) => {
                          clear();
                          setOptions((v) => ({
                            ...v,
                            indentSize: Number(e.target.value),
                          }));
                        }}
                      />
                    </div>
                    {(from === "json"
                      ? ([
                          [
                            "includeXmlDeclaration",
                            m["shared.xmlJson.declaration"],
                          ],
                          [
                            "fullTagEmptyElement",
                            m["shared.xmlJson.fullempty"],
                          ],
                        ] as const)
                      : ([
                          ["compact", m["shared.xmlJson.compact"]],
                          [
                            "ignoreDeclaration",
                            m["shared.xmlJson.ignoredeclaration"],
                          ],
                          [
                            "ignoreInstruction",
                            m["shared.xmlJson.ignoreinstruction"],
                          ],
                          [
                            "ignoreAttributes",
                            m["shared.xmlJson.ignoreattributes"],
                          ],
                          ["ignoreText", m["shared.xmlJson.ignoretext"]],
                          ["ignoreCdata", m["shared.xmlJson.ignorecdata"]],
                          ["ignoreDoctype", m["shared.xmlJson.ignoredoctype"]],
                          ["ignoreComment", m["shared.xmlJson.ignorecomment"]],
                          ["trim", m["shared.xmlJson.trim"]],
                          ["nativeType", m["shared.xmlJson.native"]],
                          ["alwaysArray", m["shared.xmlJson.array"]],
                          ["alwaysChildren", m["shared.xmlJson.children"]],
                        ] as const)
                    ).map(([key, label]) => (
                      <Switch
                        key={key}
                        isSelected={Boolean(options[key])}
                        onChange={(checked) => {
                          clear();
                          setOptions((v) => ({
                            ...v,
                            [key]: checked === true,
                          }));
                        }}
                      >
                        <Switch.Content className="flex min-h-11 items-center gap-2">
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                          <span>{label({})}</span>
                        </Switch.Content>
                      </Switch>
                    ))}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </div>
          <div className="border-t border-separator p-3">
            <ToolFilePicker
              label={m["tools.xmlToJsonConverter.structuredimport"]()}
              accept={[`.${from}`, ".txt"]}
              onSelect={(file) => {
                clear();
                if (file.size > MAX_XML_INPUT) {
                  setError(new XmlJsonError("too_large"));
                  return;
                }
                const controller = new AbortController();
                task.current = controller;
                setBusy(true);
                const current = new FileReader();
                reader.current = current;
                current.onload = () => {
                  if (task.current !== controller) return;
                  try {
                    setInput(
                      new TextDecoder("utf-8", { fatal: true }).decode(
                        current.result as ArrayBuffer,
                      ),
                    );
                  } catch {
                    setError(new XmlJsonError("read_failed"));
                  }
                  task.current = null;
                  reader.current = null;
                  setBusy(false);
                };
                current.onerror = () => {
                  if (task.current !== controller) return;
                  setError(new XmlJsonError("read_failed"));
                  task.current = null;
                  reader.current = null;
                  setBusy(false);
                };
                current.readAsArrayBuffer(file);
              }}
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onPress={() => {
                  clear();
                  setInput("");
                }}
              >
                {m["common.clear"]()}
              </Button>
              <Button onPress={() => void convert()} isDisabled={busy}>
                {busy
                  ? m["common.processing"]()
                  : m["tools.xmlToJsonConverter.structuredconvert"]()}
              </Button>
              {busy ? (
                <Button variant="outline" onPress={clear}>
                  {m["common.actions.cancel"]()}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <CodeBlock
          code={output}
          title={`${m["tools.xmlToJsonConverter.structuredoutput"]()} · ${to.toUpperCase()}`}
          description={
            <>
              {m["tools.xmlToJsonConverter.jsoncompatibility"]()}
              {output.length > 100_000 ? (
                <span className="mt-1 block">
                  {m["tools.xmlToJsonConverter.structuredpreview"]()}
                </span>
              ) : null}
            </>
          }
          language={to.toUpperCase()}
          copyLabel={m["common.actions.copyResult"]()}
          copiedLabel={m["common.actions.copied"]()}
          errorLabel={m["tools.xmlToJsonConverter.structurederror"]()}
          className="h-full"
          maxHeightClassName="min-h-80 max-h-[32rem]"
          previewCode={output ? output.slice(0, 100000) : undefined}
          actions={
            url ? (
              <a
                href={url}
                download={`converted.${to}`}
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.xmlToJsonConverter.structureddownload"]()}
              </a>
            ) : (
              <Button size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["tools.xmlToJsonConverter.structureddownload"]()}
              </Button>
            )
          }
          statusContent={
            busy ? (
              <OutputSkeleton
                label={m["tools.xmlToJsonConverter.structuredoutput"]()}
              />
            ) : error ? (
              <p role="alert" className="px-5 text-sm text-danger">
                {m["tools.xmlToJsonConverter.jsonerror"]()}
                {error.line !== undefined &&
                  m["tools.xmlToJsonConverter.structuredposition"]({
                    line: error.line,
                    column: error.column ?? 1,
                  })}
              </p>
            ) : output ? undefined : (
              <section
                aria-label={m["tools.xmlToJsonConverter.structuredoutput"]()}
                className="flex min-h-80 items-center justify-center px-5 text-center text-sm text-muted"
              >
                {m["tools.xmlToJsonConverter.structuredoutput"]()}
              </section>
            )
          }
        />
      </div>
    </div>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid min-h-80 gap-3">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function XmlToJsonPageContent() {
  return <XmlJsonConverter from="xml" to="json" />;
}
export const XmlToJson = () => <XmlJsonConverter from="xml" to="json" />;

export default function XmlToJsonPage() {
  return (
    <ToolPage>
      <XmlToJsonPageContent />
    </ToolPage>
  );
}
