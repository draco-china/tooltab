import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Label,
  ListBox,
  Select,
  Skeleton,
  Spinner,
  TextArea,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import {
  generateHmac,
  HMAC_ALGORITHMS,
  type HmacAlgorithm,
  integrityKey,
} from "@workspace/tools/hash/integrity";

type Digest = { hex: string; base64: string };
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Digest }
  | { status: "error"; message: string };

const DEFAULT_TEXT = "Hello, authenticated browser-native world!";
const DEFAULT_SECRET_KEY = "super-secret-key";
const ALGORITHM_STORAGE_KEY = "tools:hmac-generator:algorithm";

function HmacGeneratorContent() {
  const plainTextId = useId();
  const secretKeyId = useId();
  const [secretKey, setSecretKey] = useState(DEFAULT_SECRET_KEY);
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>("SHA-256");
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [digestState, setDigestState] = useState<DigestState>({
    status: "loading",
  });
  const deferredSecretKey = useDeferredValue(secretKey);
  const deferredPlainText = useDeferredValue(plainText);
  const fileErrorDescription = m["tools.hmacGenerator.fileErrorDescription"]();
  const textErrorDescription = m["tools.hmacGenerator.textErrorDescription"]();

  useEffect(() => {
    try {
      localStorage.removeItem("tools:hmac-generator:secret-key");
      const storedAlgorithm = localStorage.getItem(ALGORITHM_STORAGE_KEY);
      if (
        storedAlgorithm &&
        HMAC_ALGORITHMS.includes(storedAlgorithm as HmacAlgorithm)
      ) {
        setAlgorithm(storedAlgorithm as HmacAlgorithm);
      }
    } catch {
      // Storage is optional; HMAC generation remains fully local without it.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ALGORITHM_STORAGE_KEY, algorithm);
    } catch {
      // Storage is optional; HMAC generation remains fully local without it.
    }
  }, [algorithm]);

  useEffect(() => {
    const source = selectedFile
      ? selectedFile
      : deferredPlainText.length > 0
        ? new Blob([deferredPlainText])
        : null;
    if (!deferredSecretKey || !source) {
      setDigestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setDigestState({ status: "loading" });
    void (async () => {
      let secret: Uint8Array | undefined;
      try {
        secret = integrityKey(deferredSecretKey);
        const result = await generateHmac(
          source,
          secret,
          algorithm,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setDigestState({
            status: "ready",
            digest: { hex: result.hex, base64: result.base64 },
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDigestState({
            status: "error",
            message: selectedFile ? fileErrorDescription : textErrorDescription,
          });
        }
      } finally {
        secret?.fill(0);
      }
    })();
    return () => controller.abort();
  }, [
    algorithm,
    deferredPlainText,
    deferredSecretKey,
    fileErrorDescription,
    selectedFile,
    textErrorDescription,
  ]);

  const sourceDescription = selectedFile
    ? `${selectedFile.name} • ${formatInputFileSize(selectedFile.size)}`
    : m["tools.hmacGenerator.plainTextDescription"]();

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ConfigurationCard
          algorithm={algorithm}
          secretKey={secretKey}
          secretKeyId={secretKeyId}
          onAlgorithmChange={setAlgorithm}
          onSecretKeyChange={setSecretKey}
        />
        <InputCard
          plainText={plainText}
          plainTextId={plainTextId}
          selectedFile={selectedFile}
          sourceDescription={sourceDescription}
          onClearFile={() => setSelectedFile(null)}
          onFileChange={setSelectedFile}
          onPlainTextChange={setPlainText}
        />
        <ResultsCard
          digestState={digestState}
          selectedFile={selectedFile}
          sourceDescription={sourceDescription}
        />
      </div>
      <HmacArticle />
    </div>
  );
}

function ConfigurationCard({
  algorithm,
  secretKey,
  secretKeyId,
  onAlgorithmChange,
  onSecretKeyChange,
}: {
  algorithm: HmacAlgorithm;
  secretKey: string;
  secretKeyId: string;
  onAlgorithmChange: (value: HmacAlgorithm) => void;
  onSecretKeyChange: (value: string) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.highwayhashHashTextOrFile.configurationLabel"]()}
        </Card.Title>
        <Card.Description>
          {m["tools.hmacGenerator.configurationDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-4 py-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={secretKeyId}>
            {m["tools.hmacGenerator.secretKeyLabel"]()}
          </Label>
          <ToolPasswordInput
            id={secretKeyId}
            aria-label={m["tools.hmacGenerator.secretKeyLabel"]()}
            value={secretKey}
            placeholder={m["tools.hmacGenerator.secretKeyPlaceholder"]()}
            showLabel={m["tools.hmacGenerator.showSecretKeyLabel"]()}
            hideLabel={m["tools.hmacGenerator.hideSecretKeyLabel"]()}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onSecretKeyChange(event.currentTarget.value)}
          />
        </div>
        <Select
          variant="secondary"
          aria-label={m["common.argonAlgorithm"]()}
          selectedKey={algorithm}
          onSelectionChange={(key) =>
            key && onAlgorithmChange(key as HmacAlgorithm)
          }
          fullWidth
        >
          <Label>{m["common.argonAlgorithm"]()}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {HMAC_ALGORITHMS.map((value) => (
                <ListBox.Item key={value} id={value} textValue={value}>
                  {value}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function InputCard({
  plainText,
  plainTextId,
  selectedFile,
  sourceDescription,
  onClearFile,
  onFileChange,
  onPlainTextChange,
}: {
  plainText: string;
  plainTextId: string;
  selectedFile: File | null;
  sourceDescription: string;
  onClearFile: () => void;
  onFileChange: (file: File) => void;
  onPlainTextChange: (value: string) => void;
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
          onSelect={onFileChange}
          onClear={selectedFile ? onClearFile : undefined}
        />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({
  digestState,
  selectedFile,
  sourceDescription,
}: {
  digestState: DigestState;
  selectedFile: File | null;
  sourceDescription: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-1">
          <Card.Title>{m["tools.hmacGenerator.hmacOutputLabel"]()}</Card.Title>
          <Card.Description>
            {selectedFile
              ? sourceDescription
              : m["tools.hmacGenerator.hmacOutputDescription"]()}
          </Card.Description>
        </div>
        {digestState.status === "loading" ? <Spinner size="sm" /> : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {digestState.status === "idle" ? (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
            {m["tools.hmacGenerator.emptyStateDescription"]()}
          </div>
        ) : null}
        {digestState.status === "error" ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>{digestState.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {digestState.status === "loading" || digestState.status === "ready" ? (
          <div className="grid gap-3">
            {(
              [
                ["hex", m["common.adler32hexlabel"]()],
                ["base64", m["common.adler32base64label"]()],
              ] as const
            ).map(([key, label]) => {
              const value =
                digestState.status === "ready" ? digestState.digest[key] : "";
              return (
                <section
                  key={key}
                  className="grid gap-3 rounded-xl border border-border bg-default/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-sm font-medium">{label}</h3>
                    <ToolCopyButton
                      value={value}
                      copyLabel={m["common.adler32copyresultlabel"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      disabled={digestState.status === "loading"}
                    />
                  </div>
                  {digestState.status === "loading" ? (
                    <Skeleton className="h-6 w-full rounded-lg" />
                  ) : (
                    <code className="block text-xs leading-6 break-all sm:text-sm">
                      {value}
                    </code>
                  )}
                </section>
              );
            })}
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function HmacArticle() {
  const separator = m[
    "tools.hmacGenerator.articleCommonUseCasesLabel"
  ]().endsWith("：")
    ? "："
    : ": ";
  return (
    <ToolArticle>
      <h2>{m["tools.hmacGenerator.articleTitle"]()}</h2>
      <p>{m["tools.hmacGenerator.articleSummary"]()}</p>
      <p>
        <strong>{m["tools.hmacGenerator.articleHowItWorksLabel"]()}</strong>
      </p>
      <ol>
        {[
          m["tools.hmacGenerator.articleHowItWorks0"](),
          m["tools.hmacGenerator.articleHowItWorks1"](),
          m["tools.hmacGenerator.articleHowItWorks2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p>
        <strong>{m["tools.hmacGenerator.articleCommonUseCasesLabel"]()}</strong>
      </p>
      <ul>
        {[
          {
            title: m["tools.hmacGenerator.articleCommonUseCases0Title"](),
            body: m["tools.hmacGenerator.articleCommonUseCases0Body"](),
          },
          {
            title: m["tools.hmacGenerator.articleCommonUseCases1Title"](),
            body: m["tools.hmacGenerator.articleCommonUseCases1Body"](),
          },
          {
            title: m["tools.hmacGenerator.articleCommonUseCases2Title"](),
            body: m["tools.hmacGenerator.articleCommonUseCases2Body"](),
          },
          {
            title: m["tools.hmacGenerator.articleCommonUseCases3Title"](),
            body: m["tools.hmacGenerator.articleCommonUseCases3Body"](),
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
        <strong>{m["shared.argon2Tools.hashArticleSecurityTitle"]()}</strong>
      </p>
      <ul>
        {[
          m["tools.hmacGenerator.articleSecurityNotes0"](),
          m["tools.hmacGenerator.articleSecurityNotes1"](),
          m["tools.hmacGenerator.articleSecurityNotes2"](),
          m["tools.hmacGenerator.articleSecurityNotes3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function formatInputFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const divisor = size < 1024 * 1024 ? 1024 : 1024 * 1024;
  const unit = divisor === 1024 ? "KB" : "MB";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size / divisor)} ${unit}`;
}

export function HmacGenerator() {
  return (
    <ToolPage instructions={m["tools.hmacGenerator.usage"]()}>
      <HmacGeneratorContent />
    </ToolPage>
  );
}
