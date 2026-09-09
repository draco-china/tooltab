import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Description,
  FieldError,
  Input,
  Label,
  Skeleton,
  Spinner,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import {
  HIGHWAY_SIZES,
  type HighwaySize,
  parseHighwayKey,
} from "@workspace/tools/hash/highway";
import { runHighwayBlob } from "../city-highway/highway-client";
import { textBytes } from "@workspace/tools/hash/input";

const HIGHWAY_EXAMPLE_KEY =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const DEFAULT_TEXT = "Hello, keyed HighwayHash world!";
const STORAGE_PREFIX = "tools:highwayhash-hash-text-or-file";
const DIGEST_FIELDS = [
  ["hex", m["common.adler32hexlabel"]],
  ["base64", m["common.adler32base64label"]],
  ["decimal", m["common.adler32decimallabel"]],
  ["binary", m["common.adler32binarylabel"]],
] as const;
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Awaited<ReturnType<typeof runHighwayBlob>> }
  | { status: "error"; message: string };

function HighwayHashTextOrFileContent() {
  const locale = getLocale();
  const textId = useId();
  const keyId = useId();
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [keyInput, setKeyInput] = useState(`0x${HIGHWAY_EXAMPLE_KEY}`);
  const [outputSize, setOutputSize] = useState<HighwaySize>(64);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [digestState, setDigestState] = useState<DigestState>({
    status: "loading",
  });
  const deferredText = useDeferredValue(plainText);
  const keyState = useMemo(() => {
    try {
      return { valid: true, key: parseHighwayKey(keyInput) } as const;
    } catch {
      return { valid: false, key: undefined } as const;
    }
  }, [keyInput]);

  useEffect(() => {
    try {
      const storedSize = Number(
        localStorage.getItem(`${STORAGE_PREFIX}:output-size`),
      );
      if (storedSize === 64 || storedSize === 128 || storedSize === 256)
        setOutputSize(storedSize);
      localStorage.removeItem(`${STORAGE_PREFIX}:text`);
      localStorage.removeItem(`${STORAGE_PREFIX}:key`);
    } catch {
      // Persistent preferences are optional.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:output-size`, String(outputSize));
    } catch {
      // Hashing remains available when storage is blocked.
    }
  }, [outputSize]);

  useEffect(() => {
    if (!selectedFile && deferredText.length === 0) {
      setDigestState({ status: "idle" });
      return;
    }
    if (!keyState.valid) {
      setDigestState({
        status: "error",
        message: m["tools.highwayhashHashTextOrFile.keyInvalidLabel"](),
      });
      return;
    }
    const controller = new AbortController();
    setDigestState({ status: "loading" });
    void (async () => {
      try {
        const source = selectedFile
          ? selectedFile
          : new Blob([textBytes(deferredText)]);
        const digest = await runHighwayBlob(
          source,
          outputSize,
          keyState.key,
          controller.signal,
          () =>
            new Worker(new URL("./worker.ts", import.meta.url), {
              type: "module",
            }),
        );
        if (!controller.signal.aborted)
          setDigestState({ status: "ready", digest });
      } catch {
        if (!controller.signal.aborted) {
          setDigestState({
            status: "error",
            message: selectedFile
              ? m["tools.highwayhashHashTextOrFile.fileHashErrorLabel"]()
              : m["tools.highwayhashHashTextOrFile.textHashErrorLabel"](),
          });
        }
      }
    })();
    return () => controller.abort();
  }, [deferredText, keyState, outputSize, selectedFile]);

  const sourceDescription = selectedFile
    ? `${selectedFile.name} • ${formatFileSize(selectedFile.size, locale)}`
    : m["tools.highwayhashHashTextOrFile.plainTextDescription"]();

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6"
        data-tool-panels
      >
        <ConfigurationCard
          id={keyId}
          keyInput={keyInput}
          keyValid={keyState.valid}
          outputSize={outputSize}
          onKeyChange={setKeyInput}
          onSizeChange={setOutputSize}
        />
        <InputCard
          id={textId}
          plainText={plainText}
          selectedFile={selectedFile}
          sourceDescription={sourceDescription}
          onPlainTextChange={setPlainText}
          onSelectFile={setSelectedFile}
          onClearFile={() => setSelectedFile(null)}
        />
        <ResultsCard
          sourceDescription={sourceDescription}
          selectedFile={selectedFile}
          state={digestState}
        />
      </div>
      <ToolArticle>
        <h2>{m["tools.highwayhashHashTextOrFile.articleWhatTitle"]()}</h2>
        <p>{m["tools.highwayhashHashTextOrFile.articleWhatBody"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <ul>
          {[
            m["tools.highwayhashHashTextOrFile.articleWhenItems0"](),
            m["tools.highwayhashHashTextOrFile.articleWhenItems1"](),
            m["tools.highwayhashHashTextOrFile.articleWhenItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.highwayhashHashTextOrFile.articleOptionsTitle"]()}</h2>
        <p>{m["tools.highwayhashHashTextOrFile.articleOptionsBody"]()}</p>
        <h2>{m["shared.argon2Tools.verifierArticleSecurityTitle"]()}</h2>
        <p>{m["tools.highwayhashHashTextOrFile.articleSecurityBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function HighwayHashTextOrFile() {
  return (
    <ToolPage>
      <HighwayHashTextOrFileContent />
    </ToolPage>
  );
}

function ConfigurationCard({
  id,
  keyInput,
  keyValid,
  outputSize,
  onKeyChange,
  onSizeChange,
}: {
  id: string;
  keyInput: string;
  keyValid: boolean;
  outputSize: HighwaySize;
  onKeyChange: (value: string) => void;
  onSizeChange: (value: HighwaySize) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.highwayhashHashTextOrFile.configurationLabel"]()}
        </Card.Title>
        <Card.Description>
          {m["tools.highwayhashHashTextOrFile.configurationDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-6 py-4">
        <div className="grid gap-2">
          <Label>
            {m["tools.highwayhashHashTextOrFile.outputSizeLabel"]()}
          </Label>
          <ToggleButtonGroup
            selectionMode="single"
            className="w-full [&_button]:min-h-11"
            aria-label={m["tools.highwayhashHashTextOrFile.outputSizeLabel"]()}
            selectedKeys={new Set([String(outputSize)])}
            onSelectionChange={(selection) => {
              const next = Number([...selection][0]);
              if (next === 64 || next === 128 || next === 256)
                onSizeChange(next);
            }}
          >
            {HIGHWAY_SIZES.map((size) => (
              <ToggleButton key={size} id={String(size)}>
                {size === 64
                  ? m["tools.highwayhashHashTextOrFile.outputSize64Label"]()
                  : size === 128
                    ? m["tools.highwayhashHashTextOrFile.outputSize128Label"]()
                    : m["tools.highwayhashHashTextOrFile.outputSize256Label"]()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
        <TextField
          fullWidth
          isInvalid={!keyValid}
          className="grid min-w-0 gap-2"
        >
          <Label htmlFor={id}>
            {m["tools.highwayhashHashTextOrFile.keyLabel"]()}
          </Label>
          <Input
            id={id}
            value={keyInput}
            maxLength={4096}
            placeholder={m["tools.highwayhashHashTextOrFile.keyPlaceholder"]()}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onKeyChange(event.currentTarget.value)}
            className="w-full min-w-0 font-mono text-sm"
          />
          <Description>
            {m["tools.highwayhashHashTextOrFile.keyDescription"]()}
          </Description>
          <FieldError>
            {m["tools.highwayhashHashTextOrFile.keyInvalidLabel"]()}
          </FieldError>
        </TextField>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function InputCard({
  id,
  plainText,
  selectedFile,
  sourceDescription,
  onPlainTextChange,
  onSelectFile,
  onClearFile,
}: {
  id: string;
  plainText: string;
  selectedFile: File | null;
  sourceDescription: string;
  onPlainTextChange: (value: string) => void;
  onSelectFile: (file: File) => void;
  onClearFile: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
        <Card.Description>{sourceDescription}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-5 py-4">
        {selectedFile ? null : (
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor={id}>{m["common.adler32plaintextlabel"]()}</Label>
            <TextArea
              id={id}
              aria-label={m["common.adler32plaintextlabel"]()}
              spellCheck={false}
              value={plainText}
              onChange={(event) => onPlainTextChange(event.currentTarget.value)}
              className="min-h-64 flex-1 resize-y font-mono text-sm"
            />
          </div>
        )}
        <ToolFilePicker
          label={m["common.adler32importfromfilelabel"]()}
          fileName={selectedFile ? sourceDescription : undefined}
          clearLabel={m["common.adler32plaintextlabel"]()}
          onSelect={onSelectFile}
          onClear={selectedFile ? onClearFile : undefined}
        />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({
  sourceDescription,
  selectedFile,
  state,
}: {
  sourceDescription: string;
  selectedFile: File | null;
  state: DigestState;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-1">
          <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
          <Card.Description>
            {selectedFile
              ? sourceDescription
              : m["tools.highwayhashHashTextOrFile.hashResultDescription"]()}
          </Card.Description>
        </div>
        {state.status === "loading" ? <Spinner size="sm" /> : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <DigestSection state={state} />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function DigestSection({ state }: { state: DigestState }) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
        {m["tools.highwayhashHashTextOrFile.emptyStateDescription"]()}
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
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <div className="grid gap-3">
      {DIGEST_FIELDS.map(([field, label]) => {
        const value = state.status === "ready" ? state.digest[field] : "";
        return (
          <section
            key={field}
            className="grid gap-3 rounded-xl border border-border bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{label()}</h3>
              <ToolCopyButton
                value={value}
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={state.status === "loading"}
              />
            </div>
            {state.status === "loading" ? (
              <div className="grid gap-2" aria-busy="true">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
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
