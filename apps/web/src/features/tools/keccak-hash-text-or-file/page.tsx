import { hashTextBytes, ShaHashError } from "@workspace/tools/hash/sha-input";
import { formatHash, type HashFormat } from "@workspace/tools/hash/format";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Label, Skeleton, TextArea } from "@heroui/react";
import { FileText, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  KECCAK_OUTPUT_LENGTHS,
  type KeccakOutputLength,
  KeccakPageError,
} from "@workspace/tools/hash/keccak-browser";

import { runKeccakWorker } from "./worker-client";

const DEFAULT_TEXT = "Hello, browser-native world!";
const STORAGE_KEY = "tools:keccak-hash-text-or-file:text";
const DIGEST_FORMATS = [
  ["hex", "hexLabel"],
  ["base64", "base64Label"],
  ["decimal", "decimalLabel"],
  ["binary", "binaryLabel"],
] as const;

type Digest = Record<HashFormat, string>;
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Digest }
  | { status: "error"; code: string };

function KeccakHashTextOrFileContent() {
  const controllerRef = useRef<AbortController | null>(null);
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputBits, setOutputBits] = useState<KeccakOutputLength>(256);
  const [digestState, setDigestState] = useState<DigestState>({
    status: "loading",
  });
  const deferredPlainText = useDeferredValue(plainText);

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);

  function abortTask() {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  useEffect(() => {
    if (!selectedFile && deferredPlainText !== plainText) {
      setDigestState({ status: "loading" });
      return;
    }
    if (!selectedFile && deferredPlainText.length === 0) {
      setDigestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setDigestState({ status: "loading" });
    let textBytes: Uint8Array<ArrayBuffer> | undefined;
    try {
      if (!selectedFile) textBytes = hashTextBytes(deferredPlainText);
      const job = selectedFile
        ? ({ source: "file", file: selectedFile, outputBits } as const)
        : ({
            source: "text",
            bytes: textBytes as Uint8Array<ArrayBuffer>,
            outputBits,
          } as const);
      void runKeccakWorker(job, controller.signal)
        .then((result) => {
          if (
            controllerRef.current === controller &&
            !controller.signal.aborted
          ) {
            setDigestState({ status: "ready", digest: formatDigest(result) });
          }
          result.fill(0);
        })
        .catch((error) => {
          if (
            controllerRef.current === controller &&
            !controller.signal.aborted
          ) {
            setDigestState({
              status: "error",
              code:
                error instanceof KeccakPageError ||
                error instanceof ShaHashError
                  ? error.code
                  : "digest-failed",
            });
          }
        })
        .finally(() => {
          if (controllerRef.current === controller)
            controllerRef.current = null;
          if (textBytes?.byteLength) textBytes.fill(0);
        });
    } catch (error) {
      setDigestState({
        status: "error",
        code:
          error instanceof KeccakPageError || error instanceof ShaHashError
            ? error.code
            : "digest-failed",
      });
      if (textBytes?.byteLength) textBytes.fill(0);
      controllerRef.current = null;
    }

    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [deferredPlainText, outputBits, plainText, selectedFile]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  const sourceDescription = selectedFile
    ? `${selectedFile.name} • ${formatFileSize(selectedFile.size)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.blakeHash.blake2bOutputLengthLabel"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="grid gap-3 py-4">
            <div className="flex items-center justify-between gap-3">
              <Label>{m["shared.blakeHash.blake2bOutputLengthLabel"]()}</Label>
              <span className="font-mono text-sm text-muted">{outputBits}</span>
            </div>
            <fieldset
              aria-label={m["shared.blakeHash.blake2bOutputLengthLabel"]()}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {KECCAK_OUTPUT_LENGTHS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={value === outputBits ? "primary" : "outline"}
                  className="min-h-11 font-mono"
                  aria-pressed={value === outputBits}
                  onPress={() => {
                    abortTask();
                    setOutputBits(value);
                    setDigestState({ status: "loading" });
                  }}
                >
                  {value}
                </Button>
              ))}
            </fieldset>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {selectedFile ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-5 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm text-muted">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <Label>{m["common.adler32plaintextlabel"]()}</Label>
                <TextArea
                  aria-label={m["common.adler32plaintextlabel"]()}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                  spellCheck={false}
                  autoComplete="off"
                  value={plainText}
                  onChange={(event) => {
                    abortTask();
                    setPlainText(event.currentTarget.value);
                    setDigestState(
                      event.currentTarget.value
                        ? { status: "loading" }
                        : { status: "idle" },
                    );
                  }}
                />
              </div>
            )}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m[
                "tools.keccakHashTextOrFile.localFileDescription"
              ]()}
              onSelect={(file) => {
                abortTask();
                setSelectedFile(file);
                setDigestState({ status: "loading" });
              }}
            />
          </ToolPanelCardContent>
          {selectedFile ? (
            <ToolPanelCardFooter className="justify-start">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => {
                  abortTask();
                  setSelectedFile(null);
                  setDigestState({ status: "loading" });
                }}
              >
                {m["common.adler32plaintextlabel"]()}
              </Button>
            </ToolPanelCardFooter>
          ) : null}
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
            <Card.Description>
              {selectedFile
                ? sourceDescription
                : m["common.adler32hashresultdescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <DigestSection state={digestState} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <KeccakArticle />
    </div>
  );
}

function DigestSection({ state }: { state: DigestState }) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
        {m["tools.keccakHashTextOrFile.localEmptyLabel"]()}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>{errorMessage(state.code)}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <div className="grid gap-3" aria-busy={state.status === "loading"}>
      {DIGEST_FORMATS.map(([format, labelKey]) => {
        const value = state.status === "ready" ? state.digest[format] : "";
        return (
          <section
            key={format}
            className="grid min-w-0 gap-3 rounded-xl border border-border bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{digestLabel(labelKey)}</h3>
              <ToolCopyButton
                value={value}
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={state.status === "loading"}
              />
            </div>
            {state.status === "loading" ? (
              <div
                role="status"
                aria-label={m["tools.keccakHashTextOrFile.localLoadingLabel"]()}
                className="grid gap-2"
              >
                <Skeleton className="h-4 w-full rounded-lg" />
                <Skeleton className="h-4 w-4/5 rounded-lg" />
              </div>
            ) : (
              <code className="block text-xs leading-6 break-all sm:text-sm">
                {value}
              </code>
            )}
          </section>
        );
      })}
    </div>
  );
}

function KeccakArticle() {
  const characteristics = [
    {
      title: m["tools.keccakHashTextOrFile.articleCharacteristics0Title"](),
      body: m["tools.keccakHashTextOrFile.articleCharacteristics0Body"](),
    },
    {
      title: m["shared.blakeHash.blake2bArticleCharacteristics0Title"](),
      body: m["tools.keccakHashTextOrFile.articleCharacteristics1Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleCharacteristics2Title"](),
      body: m["tools.keccakHashTextOrFile.articleCharacteristics2Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleCharacteristics3Title"](),
      body: m["tools.keccakHashTextOrFile.articleCharacteristics3Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleCharacteristics4Title"](),
      body: m["tools.keccakHashTextOrFile.articleCharacteristics4Body"](),
    },
  ];
  const differences = [
    {
      title: m["tools.keccakHashTextOrFile.articleDifferences0Title"](),
      body: m["tools.keccakHashTextOrFile.articleDifferences0Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleDifferences1Title"](),
      body: m["tools.keccakHashTextOrFile.articleDifferences1Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleDifferences2Title"](),
      body: m["tools.keccakHashTextOrFile.articleDifferences2Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleDifferences3Title"](),
      body: m["tools.keccakHashTextOrFile.articleDifferences3Body"](),
    },
  ];
  const commonUses = [
    m["tools.keccakHashTextOrFile.articleCommonUses0"](),
    m["tools.keccakHashTextOrFile.articleCommonUses1"](),
    m["tools.keccakHashTextOrFile.articleCommonUses2"](),
    m["tools.keccakHashTextOrFile.articleCommonUses3"](),
    m["tools.keccakHashTextOrFile.articleCommonUses4"](),
  ];
  const advantages = [
    m["tools.keccakHashTextOrFile.articleAdvantages0"](),
    m["tools.keccakHashTextOrFile.articleAdvantages1"](),
    m["tools.keccakHashTextOrFile.articleAdvantages2"](),
    m["tools.keccakHashTextOrFile.articleAdvantages3"](),
    m["tools.keccakHashTextOrFile.articleAdvantages4"](),
  ];
  const technical = [
    {
      title: m["tools.keccakHashTextOrFile.articleTechnical0Title"](),
      body: m["tools.keccakHashTextOrFile.articleTechnical0Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleTechnical1Title"](),
      body: m["tools.keccakHashTextOrFile.articleTechnical1Body"](),
    },
    {
      title: m["tools.keccakHashTextOrFile.articleTechnical2Title"](),
      body: m["tools.keccakHashTextOrFile.articleTechnical2Body"](),
    },
  ];
  return (
    <ToolArticle>
      <h2>{m["tools.keccakHashTextOrFile.articleTitle"]()}</h2>
      <p>{m["tools.keccakHashTextOrFile.articleSummary"]()}</p>
      <p>
        <strong>
          {m["shared.blakeHash.blake2bArticleCharacteristicsLabel"]()}
        </strong>
      </p>
      <TermList items={characteristics} />
      <p>
        <strong>
          {m["tools.keccakHashTextOrFile.articleDifferencesTitle"]()}
        </strong>
        <br />
        {m["tools.keccakHashTextOrFile.articleDifferencesLead"]()}
      </p>
      <TermList items={differences} />
      <p>
        <strong>
          {m["tools.keccakHashTextOrFile.article.securityTitle"]()}
        </strong>
        <br />
        {m["tools.keccakHashTextOrFile.articleSecurityBody"]()}
      </p>
      <p>
        <strong>{m["common.adler32articlecommonuses"]()}</strong>
      </p>
      <TextList items={commonUses} />
      <p>
        <strong>
          {m["tools.keccakHashTextOrFile.articleAdvantagesTitle"]()}
        </strong>
      </p>
      <TextList items={advantages} />
      <p>
        <strong>
          {m["tools.keccakHashTextOrFile.articleTechnicalTitle"]()}
        </strong>
      </p>
      <TermList items={technical} />
    </ToolArticle>
  );
}

function TermList({
  items,
}: {
  items: readonly { title: string; body: string }[];
}) {
  const separator = getLocale() === "zh-CN" ? "：" : ": ";
  return (
    <ul>
      {items.map((item) => (
        <li key={item.title}>
          <strong>{item.title}</strong>
          {separator}
          {item.body}
        </li>
      ))}
    </ul>
  );
}

function TextList({ items }: { items: readonly string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function formatDigest(bytes: Uint8Array): Digest {
  return {
    hex: formatHash(bytes, "hex"),
    base64: formatHash(bytes, "base64"),
    decimal: formatHash(bytes, "decimal"),
    binary: formatHash(bytes, "binary"),
  };
}

function digestLabel(key: (typeof DIGEST_FORMATS)[number][1]) {
  switch (key) {
    case "hexLabel":
      return m["common.adler32hexlabel"]();
    case "base64Label":
      return m["common.adler32base64label"]();
    case "decimalLabel":
      return m["common.adler32decimallabel"]();
    case "binaryLabel":
      return m["common.adler32binarylabel"]();
  }
}

function errorMessage(code: string) {
  switch (code) {
    case "too-large":
      return m["tools.keccakHashTextOrFile.localTooLargeError"]();
    case "invalid-text":
      return m["tools.keccakHashTextOrFile.localInvalidTextError"]();
    case "read-failed":
      return m["tools.jwkPemConverter.localReadError"]();
    case "unsupported":
      return m["tools.keccakHashTextOrFile.localUnsupportedError"]();
    case "timeout":
      return m["tools.keccakHashTextOrFile.localTimeoutError"]();
    default:
      return m["tools.keccakHashTextOrFile.localFailureError"]();
  }
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function KeccakHashTextOrFile() {
  return (
    <ToolPage>
      <KeccakHashTextOrFileContent />
    </ToolPage>
  );
}
