import {
  hashTextBytes,
  MAX_HASH_FILE_BYTES,
  ShaHashError,
} from "@workspace/tools/hash/sha-input";
import { formatHash, type HashFormat } from "@workspace/tools/hash/format";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Input,
  Label,
  Slider,
  Spinner,
  TextArea,
} from "@heroui/react";
import { FileText, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  BlakeHashError,
  decodeBlakeKey,
  defaultBlakeBits,
  validateBlakeOptions,
} from "@workspace/tools/hash/blake";
import { runBlakeWorker } from "../blake-hash/worker-client";
import { readHashFile } from "../hash-text-or-file/logic";

type Digest = Record<HashFormat, string>;
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Digest }
  | { status: "error"; reason?: "invalidBase64"; message: string };

const DEFAULT_TEXT = "Hello, browser-native world!";
const algorithm = "BLAKE2s";
const LEGACY_STORAGE_KEY = "tools:blake2s-hash-text-or-file:text";
const DIGEST_FORMATS = [
  ["hex", m["common.adler32hexlabel"]],
  ["base64", m["common.adler32base64label"]],
  ["decimal", m["common.adler32decimallabel"]],
  ["binary", m["common.adler32binarylabel"]],
] as const;

function Blake2sHashTextOrFilePageContent() {
  const plainTextId = useId();
  const keyInputId = useId();
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [keyBase64, setKeyBase64] = useState("");
  const [outputBits, setOutputBits] = useState(defaultBlakeBits(algorithm));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [digestState, setDigestState] = useState<DigestState>({
    status: "loading",
  });
  const deferredPlainText = useDeferredValue(plainText);

  useEffect(() => {
    safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!selectedFile && deferredPlainText.length === 0) {
      setDigestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setDigestState({ status: "loading" });
    void (async () => {
      let bytes: Uint8Array<ArrayBuffer> | undefined;
      let key: Uint8Array<ArrayBuffer> | undefined;
      try {
        key = decodeBlakeKey(keyBase64);
        const options = { outputBits, key };
        validateBlakeOptions(algorithm, options);
        bytes = selectedFile
          ? await readHashFile(
              selectedFile,
              MAX_HASH_FILE_BYTES,
              controller.signal,
            )
          : hashTextBytes(deferredPlainText);
        const result = await runBlakeWorker(
          { algorithm, bytes, options },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setDigestState({ status: "ready", digest: formatDigest(result) });
        }
        result.fill(0);
      } catch (error) {
        if (!controller.signal.aborted) {
          setDigestState(resolveDigestError(error));
        }
      } finally {
        bytes?.fill(0);
        key?.fill(0);
      }
    })();

    return () => controller.abort();
  }, [deferredPlainText, keyBase64, outputBits, selectedFile]);

  const sourceDescription = selectedFile
    ? `${selectedFile.name} • ${formatFileSize(selectedFile.size)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ConfigurationCard
          keyBase64={keyBase64}
          keyInputId={keyInputId}
          outputBits={outputBits}
          onKeyChange={setKeyBase64}
          onOutputBitsChange={setOutputBits}
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
      <BlakeArticle />
    </div>
  );
}

function ConfigurationCard({
  keyBase64,
  keyInputId,
  outputBits,
  onKeyChange,
  onOutputBitsChange,
}: {
  keyBase64: string;
  keyInputId: string;
  outputBits: number;
  onKeyChange: (value: string) => void;
  onOutputBitsChange: (value: number) => void;
}) {
  const maxBits = defaultBlakeBits(algorithm);
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["shared.blakeHash.blake2sConfigurationLabel"]()}
        </Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-6 py-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>{m["shared.blakeHash.blake2bOutputLengthLabel"]()}</Label>
            <span className="font-mono text-sm text-muted">{outputBits}</span>
          </div>
          <Slider
            aria-label={m["shared.blakeHash.blake2bOutputLengthLabel"]()}
            minValue={8}
            maxValue={maxBits}
            step={8}
            value={outputBits}
            onChange={(value) => onOutputBitsChange(Number(value))}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>8</span>
            <span>{maxBits}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={keyInputId}>
            {m["shared.blakeHash.blake2bKeyLabel"]()}
          </Label>
          <Input
            id={keyInputId}
            aria-label={m["shared.blakeHash.blake2bKeyLabel"]()}
            placeholder={m["shared.blakeHash.blake2bKeyPlaceholder"]()}
            autoComplete="off"
            spellCheck={false}
            value={keyBase64}
            onChange={(event) => onKeyChange(event.currentTarget.value)}
          />
        </div>
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
      <ToolPanelCardContent className="py-4">
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
            <Label htmlFor={plainTextId}>
              {m["common.adler32plaintextlabel"]()}
            </Label>
            <TextArea
              id={plainTextId}
              aria-label={m["common.adler32plaintextlabel"]()}
              className="min-h-64 flex-1 resize-y font-mono text-sm"
              spellCheck={false}
              value={plainText}
              onChange={(event) => onPlainTextChange(event.currentTarget.value)}
            />
          </div>
        )}
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="block">
        <ToolFilePicker
          label={m["common.adler32importfromfilelabel"]()}
          fileName={selectedFile?.name}
          clearLabel={m["common.adler32plaintextlabel"]()}
          onSelect={onFileChange}
          onClear={selectedFile ? onClearFile : undefined}
        />
      </ToolPanelCardFooter>
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
          <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
          <Card.Description>
            {selectedFile
              ? sourceDescription
              : m["common.adler32hashresultdescription"]()}
          </Card.Description>
        </div>
        {digestState.status === "loading" ? <Spinner size="sm" /> : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {digestState.status === "idle" ? (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
            {m["common.adler32plaintextdescription"]()}
          </div>
        ) : null}
        {digestState.status === "error" ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              {digestState.reason === "invalidBase64" ? (
                <>
                  <Alert.Title>
                    {m["shared.base64.invalidBase64Title"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {m["shared.base64.invalidBase64Description"]()}
                  </Alert.Description>
                </>
              ) : (
                <Alert.Description>{digestState.message}</Alert.Description>
              )}
            </Alert.Content>
          </Alert>
        ) : null}
        {digestState.status === "loading" || digestState.status === "ready" ? (
          <div className="grid gap-3">
            {DIGEST_FORMATS.map(([format, labelKey]) => {
              const value =
                digestState.status === "ready"
                  ? digestState.digest[format]
                  : "";
              return (
                <section
                  key={format}
                  className={`grid gap-3 rounded-xl border border-border bg-default/20 p-4 ${
                    digestState.status === "loading" ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-sm font-medium">{labelKey()}</h3>
                    <ToolCopyButton
                      value={value}
                      copyLabel={m["common.adler32copyresultlabel"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      disabled={digestState.status === "loading"}
                    />
                  </div>
                  <code className="block text-xs leading-6 break-all sm:text-sm">
                    {value}
                  </code>
                </section>
              );
            })}
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function BlakeArticle() {
  const separator = m[
    "shared.blakeHash.blake2bArticleCharacteristicsLabel"
  ]().endsWith("：")
    ? "："
    : ": ";
  return (
    <ToolArticle>
      <h2>{m["shared.blakeHash.blake2sArticleTitle"]()}</h2>
      <p>{m["shared.blakeHash.blake2sArticleSummary"]()}</p>
      <p>
        <strong>
          {m["shared.blakeHash.blake2bArticleCharacteristicsLabel"]()}
        </strong>
      </p>
      <ul>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics0Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2sArticleCharacteristics0Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics1Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2bArticleCharacteristics1Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics2Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2bArticleCharacteristics2Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics3Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2bArticleCharacteristics3Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics4Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2bArticleCharacteristics4Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics5Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2bArticleCharacteristics5Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics6Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2bArticleCharacteristics6Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2sArticleCharacteristics7Title"]()}
          </strong>
          {separator}
          {m["shared.blakeHash.blake2sArticleCharacteristics7Body"]()}
        </li>
      </ul>
      <p>
        <strong>{m["common.adler32articlecommonuses"]()}</strong>
      </p>
      <ul>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses0"]()}</li>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses1"]()}</li>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses2"]()}</li>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses3"]()}</li>
        <li>{m["shared.blakeHash.blake2sArticleCommonUses4"]()}</li>
        <li>{m["shared.blakeHash.blake2sArticleCommonUses5"]()}</li>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses5"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function resolveDigestError(error: unknown): DigestState {
  if (error instanceof BlakeHashError && error.code === "invalid-base64") {
    return {
      status: "error",
      reason: "invalidBase64",
      message: error.message,
    };
  }
  const code =
    error instanceof BlakeHashError || error instanceof ShaHashError
      ? error.code
      : "digest-failed";
  const message =
    code === "too-large"
      ? m["shared.blakeHash.blake2bErrorTooLarge"]()
      : code === "invalid-text"
        ? m["shared.blakeHash.blake2bErrorInvalidText"]()
        : code === "read-failed"
          ? m["common.shareadfailed"]()
          : code === "unsupported"
            ? m["shared.blakeHash.blake2bErrorUnsupported"]()
            : code === "invalid-key"
              ? m["shared.blakeHash.invalidkey"]()
              : code === "invalid-length"
                ? m["shared.blakeHash.blake2sErrorInvalidLength"]()
                : m["shared.blakeHash.failure"]();
  return { status: "error", message };
}

function formatDigest(bytes: Uint8Array): Digest {
  return {
    hex: formatHash(bytes, "hex"),
    base64: formatHash(bytes, "base64"),
    decimal: formatHash(bytes, "decimal"),
    binary: formatHash(bytes, "binary"),
  };
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

export default function Blake2sHashTextOrFilePage() {
  return (
    <ToolPage>
      <Blake2sHashTextOrFilePageContent />
    </ToolPage>
  );
}
