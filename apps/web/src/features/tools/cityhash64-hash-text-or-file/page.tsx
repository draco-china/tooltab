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
import { safeLocalStorage } from "@/lib/safe-storage";
import { parseCitySeed } from "@workspace/tools/hash/city";
import { runCityBlob } from "../city-highway/city-client";
import { textBytes } from "@workspace/tools/hash/input";

const DEFAULT_TEXT = "Hello from CityHash64 in the browser.";
const STORAGE_KEY = "tools:cityhash64-hash-text-or-file:text";
const DIGEST_FIELDS = [
  ["hex", m["common.adler32hexlabel"]],
  ["base64", m["common.adler32base64label"]],
  ["decimal", m["common.adler32decimallabel"]],
  ["binary", m["common.adler32binarylabel"]],
] as const;
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Awaited<ReturnType<typeof runCityBlob>> }
  | { status: "error"; message: string };

function CityHash64HashTextOrFileContent() {
  const plainTextId = useId();
  const seedInputId = useId();
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [seedInput, setSeedInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [digestState, setDigestState] = useState<DigestState>({
    status: "loading",
  });
  const deferredPlainText = useDeferredValue(plainText);
  const seedState = useMemo(() => {
    try {
      return { isValid: true, value: parseCitySeed(seedInput) } as const;
    } catch {
      return { isValid: false, value: null } as const;
    }
  }, [seedInput]);

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!selectedFile && deferredPlainText.length === 0) {
      setDigestState({ status: "idle" });
      return;
    }
    if (!seedState.isValid) {
      setDigestState({
        status: "error",
        message: m["shared.cityHighway.cityHash64SeedInvalid"](),
      });
      return;
    }

    const controller = new AbortController();
    setDigestState({ status: "loading" });
    void (async () => {
      try {
        const source = selectedFile
          ? selectedFile
          : new Blob([textBytes(deferredPlainText)]);
        const digest = await runCityBlob(
          source,
          seedState.value,
          controller.signal,
          undefined,
          () =>
            new Worker(new URL("./worker.ts", import.meta.url), {
              type: "module",
            }),
        );
        if (!controller.signal.aborted) {
          setDigestState({ status: "ready", digest });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDigestState({
            status: "error",
            message: selectedFile
              ? m["shared.cityHighway.cityHash64FileHashError"]()
              : m["shared.cityHighway.cityHash64TextHashError"](),
          });
        }
      }
    })();
    return () => controller.abort();
  }, [deferredPlainText, seedState, selectedFile]);

  const sourceDescription = selectedFile
    ? `${selectedFile.name} • ${formatFileSize(selectedFile.size)}`
    : m["shared.cityHighway.cityHash64PlainTextDescription"]();

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <InputCard
          plainText={plainText}
          plainTextId={plainTextId}
          selectedFile={selectedFile}
          sourceDescription={sourceDescription}
          onClearFile={() => setSelectedFile(null)}
          onPlainTextChange={setPlainText}
          onSelectFile={setSelectedFile}
        />
        <SeedCard
          id={seedInputId}
          input={seedInput}
          invalid={!seedState.isValid}
          onChange={setSeedInput}
        />
        <ResultsCard
          sourceDescription={sourceDescription}
          selectedFile={selectedFile}
          state={digestState}
        />
      </div>
      <CityHashArticle />
    </div>
  );
}

function InputCard({
  plainText,
  plainTextId,
  selectedFile,
  sourceDescription,
  onClearFile,
  onPlainTextChange,
  onSelectFile,
}: {
  plainText: string;
  plainTextId: string;
  selectedFile: File | null;
  sourceDescription: string;
  onClearFile: () => void;
  onPlainTextChange: (value: string) => void;
  onSelectFile: (file: File) => void;
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
            <Label htmlFor={plainTextId}>
              {m["common.adler32plaintextlabel"]()}
            </Label>
            <TextArea
              id={plainTextId}
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

function SeedCard({
  id,
  input,
  invalid,
  onChange,
}: {
  id: string;
  input: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.murmurSeed"]()}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <TextField fullWidth isInvalid={invalid} className="grid gap-2">
          <Label htmlFor={id}>
            {m["tools.cityhash64HashTextOrFile.seed"]()}
          </Label>
          <Input
            id={id}
            value={input}
            maxLength={4096}
            placeholder={m["shared.cityHighway.cityHash64SeedPlaceholder"]()}
            spellCheck={false}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
          <Description>
            {m["shared.cityHighway.cityHash64SeedDescription"]()}
          </Description>
          <FieldError>
            {m["shared.cityHighway.cityHash64SeedInvalid"]()}
          </FieldError>
        </TextField>
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
              : m["common.adler32hashresultdescription"]()}
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
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
        {m["shared.cityHighway.cityHash64PlainTextDescription"]()}
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
      {DIGEST_FIELDS.map(([field, labelKey]) => {
        const value = state.status === "ready" ? state.digest[field] : "";
        return (
          <section
            key={field}
            className="grid gap-3 rounded-xl border border-border bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{labelKey()}</h3>
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

function CityHashArticle() {
  const separator = m[
    "shared.cityHighway.cityHash64ArticleCharacteristicsLabel"
  ]().endsWith("：")
    ? "："
    : ": ";
  return (
    <ToolArticle>
      <h2>{m["shared.cityHighway.cityHash64ArticleTitle"]()}</h2>
      <p>{m["shared.cityHighway.cityHash64ArticleSummary"]()}</p>
      <p>
        <strong>
          {m["shared.cityHighway.cityHash64ArticleCharacteristicsLabel"]()}
        </strong>
      </p>
      <ul>
        {[
          {
            title:
              m["shared.cityHighway.cityHash64ArticleCharacteristics0Title"](),
            body: m[
              "shared.cityHighway.cityHash64ArticleCharacteristics0Body"
            ](),
          },
          {
            title:
              m["shared.cityHighway.cityHash64ArticleCharacteristics1Title"](),
            body: m[
              "shared.cityHighway.cityHash64ArticleCharacteristics1Body"
            ](),
          },
          {
            title:
              m["shared.cityHighway.cityHash64ArticleCharacteristics2Title"](),
            body: m[
              "shared.cityHighway.cityHash64ArticleCharacteristics2Body"
            ](),
          },
          {
            title:
              m["shared.cityHighway.cityHash64ArticleCharacteristics3Title"](),
            body: m[
              "shared.cityHighway.cityHash64ArticleCharacteristics3Body"
            ](),
          },
          {
            title:
              m["shared.cityHighway.cityHash64ArticleCharacteristics4Title"](),
            body: m[
              "shared.cityHighway.cityHash64ArticleCharacteristics4Body"
            ](),
          },
        ].map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            {separator}
            {item.body}
          </li>
        ))}
      </ul>
      <p>
        <strong>{m["common.adler32articlecommonuses"]()}</strong>
      </p>
      <ul>
        {[
          m["shared.cityHighway.cityHash64ArticleCommonUses0"](),
          m["shared.cityHighway.cityHash64ArticleCommonUses1"](),
          m["shared.cityHighway.cityHash64ArticleCommonUses2"](),
          m["shared.cityHighway.cityHash64ArticleCommonUses3"](),
          m["shared.cityHighway.cityHash64ArticleCommonUses4"](),
          m["shared.cityHighway.cityHash64ArticleCommonUses5"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
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

export default function CityHash64HashTextOrFile() {
  return (
    <ToolPage>
      <CityHash64HashTextOrFileContent />
    </ToolPage>
  );
}
