import { Alert, Button, Card, Label, Spinner, TextArea } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";

export interface StreamingHashResult {
  hex: string;
  base64: string;
  decimal: string;
  binary: string;
}

interface ToolStreamingHashPanelsProps {
  inputTitle: string;
  resultsTitle: string;
  resultsDescription: string;
  emptyResult: string;
  isDisabled?: boolean;
  encodeText: (text: string) => Uint8Array<ArrayBuffer>;
  run: (
    blob: Blob,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ) => Promise<StreamingHashResult>;
  getErrorMessage: (error: unknown) => string;
}

export function ToolStreamingHashPanels({
  inputTitle,
  resultsTitle,
  resultsDescription,
  emptyResult,
  isDisabled = false,
  encodeText,
  run,
  getErrorMessage,
}: ToolStreamingHashPanelsProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StreamingHashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [bytes, setBytes] = useState(0);
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(
    () => () => {
      task.current?.abort();
      revision.current++;
    },
    [],
  );

  const clear = useCallback(() => {
    task.current?.abort();
    task.current = null;
    revision.current++;
    setResult(null);
    setNotice("");
    setBusy(false);
    setBytes(0);
  }, []);

  useEffect(() => {
    void run;
    clear();
  }, [run, clear]);

  async function calculate() {
    if (isDisabled) return;
    clear();
    const rev = revision.current;
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    try {
      const blob = file ?? new Blob([encodeText(text)]);
      const output = await run(blob, controller.signal, (nextBytes) => {
        if (rev === revision.current) setBytes(nextBytes);
      });
      if (rev === revision.current) setResult(output);
    } catch (error) {
      if (rev !== revision.current) return;
      setNotice(getErrorMessage(error));
    } finally {
      if (rev === revision.current) {
        setBusy(false);
        task.current = null;
      }
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{inputTitle}</Card.Title>
          <Card.Description>{m["common.streamhashScope"]()}</Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {!file ? (
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`${id}-text`}>
                {m["common.streamhashText"]()}
              </Label>
              <TextArea
                id={`${id}-text`}
                value={text}
                spellCheck={false}
                className="min-h-48 flex-1 resize-y font-mono"
                onChange={(event) => {
                  clear();
                  setText(event.target.value);
                }}
              />
            </div>
          ) : null}
          <ToolFilePicker
            label={m["common.streamhashFile"]()}
            clearLabel={m["common.streamhashBack"]()}
            fileName={file ? `${file.name} · ${file.size} B` : undefined}
            isDisabled={busy}
            onSelect={(selected) => {
              clear();
              setFile(selected);
            }}
            onClear={
              file
                ? () => {
                    clear();
                    setFile(null);
                  }
                : undefined
            }
          />
        </ToolPanelCardContent>
        <ToolPanelCardFooter>
          <ToolPanelActionGroup>
            <Button isDisabled={busy || isDisabled} onPress={calculate}>
              {(busy
                ? m["shared.legacyHashes.streamhashBusy"]
                : m["shared.legacyHashes.streamhashRun"])({})}
            </Button>
            {busy ? (
              <Button
                variant="outline"
                onPress={() => {
                  clear();
                  setNotice(m["common.streamhashCancelled"]());
                }}
              >
                {m["common.actions.cancel"]()}
              </Button>
            ) : null}
          </ToolPanelActionGroup>
        </ToolPanelCardFooter>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <Card.Title>{resultsTitle}</Card.Title>
            <Card.Description>{resultsDescription}</Card.Description>
          </div>
          {busy ? <Spinner size="sm" /> : null}
        </Card.Header>
        <ToolPanelCardContent className="py-4" aria-busy={busy}>
          {notice ? (
            <Alert status="danger" role="status">
              <Alert.Indicator>
                <TriangleAlert aria-hidden className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Description>{notice}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {busy ? (
            <p role="status" className="text-sm text-muted">
              {m["common.streamhashBytes"]()}: {bytes}
            </p>
          ) : null}
          {!busy && !notice && !result ? (
            <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
              {emptyResult}
            </div>
          ) : null}
          {result ? (
            <div className="grid">
              {(["hex", "base64", "decimal", "binary"] as const).map(
                (format) => (
                  <section
                    key={format}
                    className="grid min-w-0 gap-2 border-b border-separator py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">
                        {format === "hex"
                          ? "Hex"
                          : format === "base64"
                            ? "Base64"
                            : format === "decimal"
                              ? m["common.streamhashDecimal"]()
                              : m["common.streamhashBinary"]()}
                      </h3>
                      <ToolCopyButton
                        value={result[format]}
                        copyLabel={m["common.actions.copy"]()}
                        copiedLabel={m["common.actions.copied"]()}
                        errorLabel={m["common.streamhashCopyFailed"]()}
                      />
                    </div>
                    <code className="block text-xs leading-6 break-all sm:text-sm">
                      {result[format]}
                    </code>
                  </section>
                ),
              )}
            </div>
          ) : null}
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}
